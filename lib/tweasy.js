var Client
  , querystring = require('querystring')
  , sys = require('sys')
  , events = require('events')
  ;

function log(e) {
  sys.puts(sys.inspect(e));
};

// singleton data structure so you don't need to manage a client per-user
var rateLimiter = {};

function removeOldLogs(limiter) {
  var i, hourAgo = new Date(new Date() - (60 * 60 * 1000));
  for (i=0; i < limiter.log.length; i++) {
    if (limiter.log[i] > hourAgo) {
      break;
    }
  };
  limiter.log = limiter.log.slice(i);
}

function maybeRateLimit(key, limit, force, fun) {
  var rl;
  if (!limit) {
    return fun();
  } else {
    rateLimiter[key] = rateLimiter[key] || {
      log : [],
      queue : []
    };
    rl = rateLimiter[key];
    removeOldLogs(rl);
    // start queueing once you've used half your limit
    if (force || rl.log.length > (limit/2)) {
      log("queuing requests: "+rl.queue.length);
      rl.queue.push(fun);
      rl.drainer = rl.drainer || setInterval(function() {
        var rfun = rl.queue.shift();
        if (rfun) {
          log("used requests: "+rl.log.length);
          rl.log.push(new Date());
          rfun();
        } else {
          clearInterval(rl.drainer);
          rl.drainer = null;
        }
      }, (3600 / limit) * 1000);
    } else {
      log("used requests: "+rl.log.length);
      rl.log.push(new Date());
      fun();
    }
  }
}


Client = function(oauth, creds, opts) {
  this.oauth = oauth;
  this.creds = creds;
  this.opts = opts || {};
  // rate limit is in requests per hour
  // http://dev.twitter.com/pages/rate-limiting
  this.opts.rate_limit = this.opts.rate_limit || 350;
};

Client.prototype.request = function(url, params /*, opts, cb */) {
  var cb, opts, tweasycb, req, self = this, defaults = {
    method : "GET",
    rate_limit : this.opts.rate_limit,
    force_rate_limit : this.opts.force_rate_limit
  };
  if (arguments.length == 4) {
    cb = arguments[3];
    opts = arguments[2];
  } else {
    cb = arguments[2];
    opts = {};
  }
  Object.keys(defaults).forEach(function(key){
    opts[key] = (typeof opts[key] == "undefined") ? defaults[key] : opts[key];
  });
  if (cb) {
    tweasycb = function (er, data, resp) {
      // todo handle 400 and 502 errors by backing off
      try {
        data = JSON.parse(data);
        cb(er, data, resp);
      } catch(e) {
        cb({
          error : er,
          json_error : e,
          data : data
        }, data, resp);
      }
    };
  } else {
    // if you don't use a callback you are responsible for your own rate limiting
    opts.rate_limit = false;
  };
  return maybeRateLimit(this.creds.access_token,
    opts.rate_limit, opts.force_rate_limit,
    function() {
      var req;
      if (opts.method == "GET") {
        if (params) {
          url = url + '?' + querystring.stringify(params);
        }
        return self.oauth.get(url, self.creds.access_token,
          self.creds.access_token_secret, tweasycb);
      } else if (opts.method == "POST") {
        return self.oauth.post(url, self.creds.access_token,
          self.creds.access_token_secret, params, tweasycb);
      }
    });
}

Client.prototype.search = function(params, cb) {
  this.request("http://search.twitter.com/search.json", params, cb);
}

Client.prototype.userProfile = function(params, cb) {
  this.request("http://api.twitter.com/1/users/show.json", params, cb);
}

Client.prototype.userTimeline = function(params, cb) {
  this.request("http://api.twitter.com/1/statuses/user_timeline.json", params, cb);
}

Client.prototype.retweet = function(id, cb) {
  this.request("http://api.twitter.com/1/statuses/retweet/"+id+".json", {},
    {method:"POST"}, cb);
}


Client.prototype.updateStatus = function(status /*, params, cb */) {
  var cb, annotations, params = {};
  if (arguments.length == 3) {
    cb = arguments[2];
    params = arguments[1];
  } else {
    cb = arguments[1];
  }
  params.status = status;
  if (params.annotations) {
    params.annotations = JSON.stringify(params.annotations);
  }
  this.request("http://api.twitter.com/1/statuses/update.json", params, {
    rate_limit : false,
    method:"POST"}, cb);
}

Client.prototype.userStream = function() {
  var req = this.request("https://betastream.twitter.com/2b/user.json", {}, 
      {rate_limit:false}, null)
    , stream = new events.EventEmitter()
    , buffer = ''
    , end = '\r\n'
    ;
  stream.addListener("data", function (chunk) {
    var blob;
    buffer += chunk;
    if (buffer.indexOf(end) !== -1) {
      while (buffer.indexOf(end) !== -1) {
        blob = buffer.slice(0, buffer.indexOf(end));
        buffer = buffer.slice(buffer.indexOf(end) + end.length);
        if (blob.length > 0) {
          stream.emit('line', blob);
        }
      }
    }
  });
  stream.addListener("line", function(blob) {
    var json;
    try {json = JSON.parse(blob);}
    catch(e) {stream.emit('json-error', e, blob)}
    if (json) {
      stream.emit("json", json)
    }
  });
  req.socket.addListener("error",function(e) {
    stream.emit("error", e);
  });
  req.addListener('response', function(resp) {
    resp.setEncoding('utf8');
    resp.addListener('data', function (chunk) {
      stream.emit("data", chunk);
    });
    resp.addListener('end', function () {
      stream.emit('end');
    });
  });
  req.end();
  return stream;
};

exports.init = function(oauth, creds, opts) {
  return new Client(oauth, creds, opts);
};

