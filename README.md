# Tweasy - OAuth-enabled Node.js Twitter Client 
## With streaming and regular API calls

Tweasy lets you do things like pull tweets from Twitter, post statuses, etc. It also can use the User Stream API.

It is still very basic, but all the plumbing is there, so if you want to add a request for Direct Messages, etc, please fork and patch, I'll be happy to merge changes back in.

## Usage

First you need your OAuth credentials, eg your application's `consumer_key` and `consumer_key_secret` as well as the `access_token` and `access_token_secret` that correspond with the Twitter account you will be accessing the Twitter API on behalf of. More info here: <http://dev.twitter.com/pages/auth>

### Setup Credentials

Once you have that data, do this to get a Twitter Client instance.

    var util = require('util')
      , tweasy = require("tweasy")
      , OAuth = require("oauth").OAuth
      ;
    var oauthConsumer = new OAuth(
        "http://twitter.com/oauth/request_token",
        "http://twitter.com/oauth/access_token", 
        my_consumer_key,  my_consumer_secret, 
        "1.0", null, "HMAC-SHA1");
    var twitterClient = tweasy.init(oauthConsumer, {
      access_token : my_users_access_token,
      access_token_secret : my_users_access_token_secret
    });

### Read some tweets

Now that you have the instance, let's get some Tweets from a user:

    twitterClient.userTimeline({screen_name : "jchris", count:100},
      function(er, tweets) {
        for (var i=0; i < tweets.length; i++) {
          util.puts(tweets[i].text);
        };
      });

### Update Status

You can also update your status:

    twitterClient.updateStatus("testing Tweasy from Node.js", 
      function(er, resp){
        if (!er) {
          util.puts("you tweeted!")
        }
      });

### Stream Tweets

You can even listen to the User Stream for your logged-in user:

    var stream = twitterClient.userStream();
    stream.addListener("json", function(json){
      util.puts(util.inspect(json));
    });

### Get a users's profile

    twitterClient.userProfile({screen_name:"jchris"}, 
      function(er, profile){
        util.puts(profile.name);
      });

### More

It should be "trivial" to add more methods. The implementation of `userProfile`, for instance, looks like this:

    Client.prototype.userProfile = function(params, cb) {
      this.request("http://api.twitter.com/1/users/show.json", params, cb);
    }

Please add features and contribute them back.

Enjoy!

## TODO

* Automagically handle rate-limits and queuing.
* Add more API methods.

## License

[Apache 2.0](http://www.apache.org/licenses/LICENSE-2.0.html)
