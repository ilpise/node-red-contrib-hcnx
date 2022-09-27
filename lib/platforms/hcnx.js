var _ = require('underscore');
var moment = require('moment');
var { ChatExpress, ChatLog } = require('chat-platform');
var utils = require('../helpers/utils');
var when = utils.when;
const got = require('got');

var fs = require('fs')
var logger = fs.createWriteStream('loghcnxfr.log', {
  flags: 'a' // 'a' means appending (old data will be preserved)
})


// Parse the phone number - taken from twilio TODO move in this directory
// TODO Actually is not used
var helpers = require('./helpers');
var fixNumber = helpers.fixNumber;

// mysql connection
var mysql = require('mysql2');

let connection = mysql.createConnection({
    host: 'localhost',
    user: 'af2m',
    password: 'zUhNS5mOCy5Ig.-.',
    database: 'af2m'
});

// https://github.com/guidone/node-red-contrib-chatbot/wiki/Extend-node
//
var Hcnx = new ChatExpress({
  inboundMessageEvent: 'message',
  transport: 'hcnx',
  transportDescription: 'Hcnx',
  relaxChatId: true, // sometimes chatId is not necessary (for example inline_query_id)
  // ATT the payload here is msg.OriginalMessage
  chatIdKey: function(payload) {
    // console.log('chatIdKey');
    // console.log(payload);
    // return payload.chat != null ? payload.chat.id : null;
    return payload.sender != null ? payload.sender : null;
  },
  userIdKey: function(payload) {
    // return payload.from.id;
    return payload.sender != null ? payload.sender : null;
  },
  messageIdKey: function(payload) {
    return payload.message_id;
  },
  tsKey: function() {
    return moment();
  },
  language: function(payload) {
    return payload != null && payload.from != null ? payload.from.language_code : null;
  },

  // node.chat.onStart(func) 	Callback when the node is initialized, must return a promise.
  onStart: function() {
    var options = this.getOptions();
    console.log('onStart');
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

  routes: {
    '/redbot/hcnx': function(req, res) {
      const chatServer = this;
      // console.log('HCNX /redbot/hcnx');
      // console.log(req.query);
      const json = req.query;
      // { sender: '393938555528', text: 'Ciao' }

      chatServer.receive(json);

      res.send({ status: 'ok' });
    },
    '/redbot/hcnxfr': function(req, res) {
      // console.log(req.method);
      // console.log(req.query);
      // console.log(req.query.variable);
      logger.write('-----------------------------------\r\n');
      logger.write(req.method);
      logger.write('\r\n');
      logger.write(JSON.stringify(req.headers));
      logger.write('\r\n');
      logger.write(JSON.stringify(req.body));
      logger.write('\r\n');
      logger.write(JSON.stringify(req.query));
      logger.write('\r\n');
      logger.write('-----------------------------------\r\n');
      // res.send(req.body);
      const chatServer = this;
      console.log('HCNX /redbot/hcnx');
      // console.log(req.query);
      // const json = JSON.stringify(req.body);
      // console.log(json);

      var step = 0;
      var spamtype = 'notset';
      // Get the logged mo from the FROM user
      connection.execute(
        'SELECT * FROM `mo_logs` WHERE `sent_by` = ?',
        [req.body.FROM],
        function(err, results, fields) {
          console.log("SELECT array results");
          console.log(results); // results contains rows returned by server
          // [ { id: 1, sent_by: '#257485206700617', step: 0 } ]
          // console.log(fields); // fields contains extra meta data about results, if available

          // If you execute same statement again, it will be picked from a LRU cache
          // which will save query preparation time and give better performance
          // Add/update the entry
          if (results.length === 0){
            connection.execute(
              'INSERT INTO `mo_logs` SET `sent_by` = ?, `step` = ?',
              [req.body.FROM, 0],
              function(err, results, fields) {
                console.log("INSERT array results");
                console.log(results); // results contains rows returned by server
                // ResultSetHeader {
                //   fieldCount: 0,
                //   affectedRows: 1,
                //   insertId: 1,
                //   info: '',
                //   serverStatus: 2,
                //   warningStatus: 0
                // }

                // console.log(fields); // undefined

                // If some check from ResultSetHeader
                // step = 0;

              }
            );
          } else {
            step = parseInt(results[0].step)
            spamtype = results[0].spamtype;
          }

          var json = { sender: req.body.FROM, text: req.body.MESSAGE, step: step, spamtype: spamtype }
          json.custom = req.body
          chatServer.receive(json);
          res.send('MT\n\n');

        }
      );


    },
    '/redbot/hcnx/test': function(req, res) {
      // console.log(req.method);
      // console.log(req.query);
      // console.log(req.query.variable);
      res.send('ok');
      // res.send(req.body);
    }
  },
  routesDescription: {
    '/redbot/hcnx': 'Use this as Service Endpoint for HCNX In',
    '/redbot/hcnxfr': 'Use this as Service Endpoint for HCNX FR In',
    '/redbot/hcnx/test': 'Use this to test that your SSL (with certificate or ngrok) is working properly, should answer "ok"'
   }
});

// this middleware handles the message of type 'message'
// non usare node.chat.out(myType, func) - se no this.getOptions non funziona
Hcnx.out(function(message) {
  console.log('OUT 1');
  var options = this.getOptions();
  // console.log(options.url);
  // console.log(options.accountId);
  // console.log(options.accountPassword);
  //
  // console.log(message);

  // Skip send if message is empty
  if (message.payload.content == null) {
    return Promise.resolve(message);
  }

  // For development - skip send if message is not to be sent to Pise
  // if (message.payload.chatId != '393938555528') {
  //   return Promise.resolve(message);
  // }

  var composedUrl = options.url+
                   '?accountid='+options.accountId+
                   '&password='+options.accountPassword+
                   '&text='+message.payload.content+
                   '&datacoding=0'+
                   '&to='+message.payload.chatId+
                  //  '&sender='+messsage.payload.from
                   '&sender=HCNX';

  console.log(composedUrl);

  return got.post(encodeURI(composedUrl)).then(response => {
    message.status = response.statusCode;
    // this make the chain of promises returns the message object enriched with the status code
    // returned by API to be used by a downstream node
    return message;
  });

});

// log messages, these should be the last
Hcnx.out(function(message) {
  // console.log('OUT 2');
  var options = this.getOptions();
  // console.log(options)
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


// middlewares running on INPUT node HcnxInNode
Hcnx.in(function(message) {
  // console.log("HCNX IN simple");
  // console.log(message);
  return new Promise(function (resolve) {
    if (!_.isEmpty(message.originalMessage.text)) {
      message.payload.type = 'message';
      message.payload.content = message.originalMessage.text;
    }
    resolve(message);
  });
});

Hcnx.in('*', function(message) {
  // console.log("HCNX IN *");
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
