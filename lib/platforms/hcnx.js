var _ = require('underscore');
var moment = require('moment');
var { ChatExpress, ChatLog } = require('chat-platform');
var utils = require('node-red-contrib-chatbot/lib/helpers/utils');
var when = utils.when;

// Parse the phone number
var helpers = require('node-red-contrib-chatbot/lib/platforms/twilio/helpers');
var fixNumber = helpers.fixNumber;

// var twilio = require('twilio');


// https://github.com/guidone/node-red-contrib-chatbot/wiki/Extend-node
//
var Hcnx = new ChatExpress({
  inboundMessageEvent: 'message',
  transport: 'hcnx',
  transportDescription: 'Hcnx',
  relaxChatId: true, // sometimes chatId is not necessary (for example inline_query_id)
  // ATT the payload here is msg.OriginalMessage
  chatIdKey: function(payload) {
    return payload.chat != null ? payload.chat.id : null;
  },
  userIdKey: function(payload) {
    return payload.from.id;
  },
  messageIdKey: function(payload) {
    return payload.message_id;
  },
  tsKey: function(payload) {
    return moment.unix(payload.date);
  },
  language: function(payload) {
    return payload != null && payload.from != null ? payload.from.language_code : null;
  },

  // node.chat.onStart(func) 	Callback when the node is initialized, must return a promise.
  onStart: function() {
    var options = this.getOptions();
    console.log('onStart');
    console.log(options);
    // options.connector = twilio(options.accountSid, options.authToken);
    // options.connector = hcnx(options.accountId, options.accountPassword);
    // return options.connector.setWebHook(options.webHook);
    return when(true);
  },
  onStop: function() {
    var options = this.getOptions();
    options.connector = null;
    return when(true);
  },
  // routes: {
  //   // '/redbot/twilio': function(req, res) {
  //   //   this.receive(req.body);
  //   //   res.send(''); // sending 200 cause an "OK" in whatsup
  //   // },
  //   '/redbot/hcnx/test': function(req, res) {
  //     res.send('ok');
  //   },
  // },
  // routesDescription: {
  //   '/redbot/twilio': 'todo fix'
  // }
});

Hcnx.out('message', function(message) {
  var options = this.getOptions();
  var context = message.chat();
  var client = message.client();
  var fromNumber = options.fromNumber;

  return new Promise(function (resolve, reject) {
    client.messages
      .create({
        body: message.payload.content,
        from: fixNumber(fromNumber),
        to: fixNumber(message.payload.chatId)
      })
      .then(function(message) {
        return when(context.set('messageId', message.sid))
      })
      .then(
        function() {
          resolve(message);
        },
        reject
      );
  });
});

/*
{ ToCountry: 'GB',
  ToState: '',
  SmsMessageSid: '',
  NumMedia: '0',
  ToCity: '',
  FromZip: '',
  SmsSid: '',
  FromState: '',
  SmsStatus: 'received',
  FromCity: '',
  Body: 'this is another answer',
  FromCountry: 'IT',
  To: '<twilio number>',
  MessagingServiceSid: '',
  ToZip: '',
  NumSegments: '1',
  MessageSid: '',
  AccountSid: '',
  From: '<who sent>',
  ApiVersion: '2010-04-01'
}
*/

// log messages, these should be the last
Hcnx.out(function(message) {
  var options = this.getOptions();
  var logfile = options.logfile;
  var chatContext = message.chat();
  if (!_.isEmpty(logfile)) {
    return when(chatContext.all())
      .then(function(variables) {
        var chatLog = new ChatLog(variables);
        return chatLog.log(message, logfile);
      });
  }
  return message;
});

 // Middleware
Hcnx.in(function(message) {
  return new Promise(function (resolve) {
    if (!_.isEmpty(message.originalMessage.Body)) {
      message.payload.type = 'message';
      message.payload.content = message.originalMessage.Body;
    }
    resolve(message);
  });
});

Hcnx.in('*', function(message) {
  var options = this.getOptions();
  var logfile = options.logfile;
  var chatContext = message.chat();
  if (!_.isEmpty(logfile)) {
    return when(chatContext.all())
      .then(function(variables) {
        var chatLog = new ChatLog(variables);
        return chatLog.log(message, logfile);
      });
  }
  return message;
});

Hcnx.registerMessageType('message', 'Message', 'Send a plain text message');

module.exports = Hcnx;
