var _ = require('underscore');
var moment = require('moment');
var { ChatExpress, ChatLog } = require('chat-platform');
var utils = require('node-red-contrib-chatbot/lib/helpers/utils');
var when = utils.when;
const got = require('got');

// Parse the phone number - taken from twilio TODO move in this directory
var helpers = require('node-red-contrib-chatbot/lib/platforms/twilio/helpers');
var fixNumber = helpers.fixNumber;

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
    // console.log('onStart');
    // console.log(options);
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
  // le routes servono per i WebHooks - in ingresso chatbot-hcnx-receive HcnxInNode
  //   ------ WebHooks for TELEGRAM----------------
  // http://localhost:1880/redbot/telegram/test
  // http://localhost:1880/redbot/telegram

  // TODO guarda l'implementazione in alexa.js
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

// this middleware handles the message of type 'message'
Hcnx.out('message', message => {
  // https://github.com/request/request is deprecated
  // return request('https://my.api/send', data: {
  //   text: message.payload.content,
  //   to: message.payload.chatId
  // }).then(response => {
  //   message.status = response.statusCode;
  //   // this make the chain of promises returns the message object enriched with the status code
  //   // returned by API to be used by a downstream node
  //   return message;
  // });
  return got.post('https://fastapi-itcnx-29609.hcnx.eu/?accountid=KDEV3&password=jhg7689&text=CIAO&datacoding=0&to=393938555528&sender=HCNX').then(response => {
    message.status = response.statusCode;
    // this make the chain of promises returns the message object enriched with the status code
    // returned by API to be used by a downstream node
    return message;
  });

});

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
