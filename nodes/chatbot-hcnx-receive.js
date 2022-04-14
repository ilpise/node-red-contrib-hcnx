const _ = require('underscore');
const moment = require('moment');
const HcnxServer = require('../lib/platforms/hcnx');
const { ContextProviders, ChatExpress } = require('chat-platform');
const utils = require('node-red-contrib-chatbot/lib/helpers/utils');
const clc = require('cli-color');
const lcd = require('node-red-contrib-chatbot/lib/helpers/lcd');
const prettyjson = require('prettyjson');
const validators = require('node-red-contrib-chatbot/lib/helpers/validators');
const RegisterType = require('node-red-contrib-chatbot/lib/node-installer');
const GlobalContextHelper = require('node-red-contrib-chatbot/lib/helpers/global-context-helper');

const when = utils.when;
const warn = clc.yellow;
const green = clc.green;


module.exports = function(RED) {
  const registerType = RegisterType(RED);
  const globalContextHelper = GlobalContextHelper(RED);

  // register Hcnx server
  if (RED.redbot == null) {
    RED.redbot = {};
  }
  if (RED.redbot.platforms == null) {
    RED.redbot.platforms = {};
  }
  RED.redbot.platforms.hcnx = HcnxServer;

  var contextProviders = ContextProviders(RED);

  // Configuration Node
  function HcnxBotNode(n) {
    RED.nodes.createNode(this, n);
    var node = this;
    // console.log('BOT node');
    // console.log(node);
    // console.log('END BOT node');

    globalContextHelper.init(this.context().global);
    var environment = this.context().global.environment === 'production' ? 'production' : 'development';
    var isUsed = utils.isUsed(RED, node.id);
    var startNode = utils.isUsedInEnvironment(RED, node.id, environment);
    var hcnxConfigs = globalContextHelper.get('hcnx') || {};

    // See node-red-contrib-chatbot/lib/sender-factory.js - line 42
    this.botname = n.botname;
    this.store = n.store;
    this.log = n.log;
    this.connectorParams = n.connectorParams; // TODO remove
    this.usernames = n.usernames != null ? n.usernames.split(',') : [];
    this.polling = n.polling; // TODO remove
    this.providerToken = n.providerToken; // TODO remove
    this.debug = n.debug;
    // this.webHook = n.webHook;
    // this.accountId = n.accountId;
    // this.accountPassword = n.accountPassword;

    if (!isUsed) {
      // silently exit, this node is not used
      return;
    }
    // exit if the node is not meant to be started in this environment
    if (!startNode) {
      // eslint-disable-next-line no-console
      console.log(warn('Hcnx Bot ' + this.botname + ' will NOT be launched, environment is ' + environment));
      return;
    }
    // eslint-disable-next-line no-console
    console.log(green('Hcnx Bot ' + this.botname + ' will be launched, environment is ' + environment));
    // get the context storage node
    var contextStorageNode = RED.nodes.getNode(this.store);
    // parse JSON config
    // TODO remove
      var connectorParams = null;
      if (!_.isEmpty(this.connectorParams))
      {
        try {
          connectorParams = JSON.parse(this.connectorParams);
        } catch (error) {
          lcd.dump(error, 'Error in JSON configuration of Hcnx Connector');
          // eslint-disable-next-line no-console
          console.log(lcd.red(this.connectorParams));
          // eslint-disable-next-line no-console
          console.log('');
          return;
        }
      }
    // build the configuration object
    var botConfiguration = {
      authorizedUsernames: node.usernames,
      logfile: node.log,
      contextProvider: contextStorageNode != null ? contextStorageNode.contextStorage : null,
      contextParams: contextStorageNode != null ? contextStorageNode.contextParams : null,
      debug: node.debug,
      connectorParams: connectorParams,
      // webHook: this.webHook,
      // accountId: this.accountId,
      // accountPassword: this.accountPassword
    };
    // check if there's a valid configuration in global settings
    if (hcnxConfigs[node.botname] != null) {
      var validation = validators.platform.hcnx(hcnxConfigs[node.botname]);
      if (validation != null) {
        /* eslint-disable no-console */
        console.log('');
        console.log(lcd.error('Found a Hcnx configuration in settings.js "' + node.botname + '", but it\'s invalid.'));
        console.log(lcd.grey('Errors:'));
        console.log(prettyjson.render(validation));
        console.log('');
        return;
      } else {
        console.log('');
        console.log(lcd.grey('Found a valid Hcnx configuration in settings.js: "' + node.botname + '":'));
        console.log(prettyjson.render(hcnxConfigs[node.botname]));
        console.log('');
        /* eslint-enable no-console */
        botConfiguration = hcnxConfigs[node.botname];
      }
    }
    // check if context node
    if (botConfiguration.contextProvider == null) {
      // eslint-disable-next-line no-console
      console.log(lcd.warn('No context provider specified for chatbot ' + node.botname + '. Defaulting to "memory"'));
      botConfiguration.contextProvider = 'memory';
      botConfiguration.contextParams = {};
    }
    // if chat is not already there and there's a token
    if (node.chat == null) {
      // check if provider exisst
      if (!contextProviders.hasProvider(botConfiguration.contextProvider)) {
        node.error('Error creating chatbot ' + this.botname + '. The context provider '
          + botConfiguration.contextProvider + ' doesn\'t exist.');
        return;
      }
      // create a factory for the context provider
      node.contextProvider = contextProviders.getProvider(
        botConfiguration.contextProvider,
        { ...botConfiguration.contextParams, id: this.store }
      );
      // try to start the servers
      // See chatbot-telegram-receive.js line 14 for example
      try {
        node.contextProvider.start();
        node.chat = HcnxServer.createServer(_.extend(
          {
            authorizedUsernames: botConfiguration.authorizedUsernames,
            contextProvider: node.contextProvider,
            logfile: botConfiguration.logfile,
            debug: botConfiguration.debug,
            // webHook: botConfiguration.webHook,
            // TODO add accountId && accountPassword
            // accountId: botConfiguration.accountId,
            // accountPassword: botConfiguration.accountPassword,
            RED: RED
          },
          botConfiguration.connectorParams
        ));
        // add extensions
        RED.nodes.eachNode(function(currentNode) {
          if (currentNode.type === 'chatbot-extend' && !_.isEmpty(currentNode.codeJs)
            && currentNode.platform === 'hcnx') {
            try {
              eval(currentNode.codeJs);
            } catch (e) {
              lcd.node(currentNode.codeJs, {
                color: lcd.red,
                node: currentNode,
                title: 'Syntax error in Extend Chat Server node'
              });
            }
          }
        });
        // finally launch it
        node.chat.start();
        // handle error on sl6teack chat server
        node.chat.on('error', function(error) {
          node.error(error);
        });
        node.chat.on('warning', function(warning) {
          node.warn(warning);
        });
      } catch(e) {
        node.error(e);
      }
    }

    this.on('close', function (done) {
      node.chat.stop()
        .then(function() {
          return node.contextProvider.stop();
        })
        .then(function() {
          node.chat = null;
          node.contextProvider = null;
          ChatExpress.reset();
          ContextProviders.reset();
          done();
        });
    });
  }
  registerType('chatbot-hcnx-node', HcnxBotNode, {
    // Set empty credentials /nodes/chatbot-alexa-receive.js
    credentials: {
      // token: {
      //   type: 'text'
      // }
    }
  });
  // END OFR Configuration Node

  /*
  / chatbot-hcnx-receive
  / See sender-factory.js line 164 - GenericInNode
  */
  function HcnxInNode(config) {

    RED.nodes.createNode(this, config);
    var node = this;
    globalContextHelper.init(this.context().global);
    var global = this.context().global;
    var environment = global.environment === 'production' ? 'production' : 'development';
    var nodeGlobalKey = null;

    this.bot = config.bot;
    this.botProduction = config.botProduction;
    this.config = RED.nodes.getNode(environment === 'production' ? this.botProduction : this.bot);

    if (this.config) {
      this.status({fill: 'red', shape: 'ring', text: 'disconnected'});
      node.chat = this.config.chat;
      if (node.chat) {
        this.status({fill: 'green', shape: 'ring', text: 'connected'});
        nodeGlobalKey = 'hcnx_master_' + this.config.id.replace('.','_');
        var isMaster = false;
        if (globalContextHelper.get(nodeGlobalKey) == null) {
          isMaster = true;
          globalContextHelper.set(nodeGlobalKey, node.id);
        }
        node.chat.on('message', function (message) {
          var context = message.chat();
          // check if there is a conversation is going on
          when(context.get('currentConversationNode'))
            .then(function(currentConversationNode) {
              // if there's a current converation, then the message must be forwarded
              if (currentConversationNode != null) {
                // if the current node is master, then redirect, if not master do nothing
                if (isMaster) {
                  when(context.remove('currentConversationNode'))
                    .then(function () {
                      // emit message directly the node where the conversation stopped
                      RED.events.emit('node:' + currentConversationNode, message);
                    });
                }
              } else {
                node.send(message);
              }
            });
        });
      } else {
        node.warn('Missing or incomplete configuration in Hcnx Receiver');
      }
    } else {
      node.warn('Missing configuration in Hcnx Receiver');
    }

    this.on('close', function (done) {
      globalContextHelper.set(nodeGlobalKey, null);
      if (node.chat != null) {
        node.chat.off('message');
      }
      done();
    });

    this.on('input', function(msg) {
      if (node.chat != null) {
        node.chat.receive(msg);
      }
    });
  }
  registerType('chatbot-hcnx-receive', HcnxInNode);

  /*
  * chatbot-hcnx-send
  * See sender-factory.js line 234 - GenericOutNode
  * See https://nodered.org/docs/creating-nodes/credentials
  */
  function HcnxOutNode(config) {
    RED.nodes.createNode(this, config);

    var node = this;
    globalContextHelper.init(this.context().global);
    var global = this.context().global;
    var environment = global.environment === 'production' ? 'production' : 'development';

    this.bot = config.bot;
    this.botProduction = config.botProduction;
    // Accessing credentials
    //   Runtime use of credentials
    //   Within the runtime, a node can access its credentials using the credentials property:
    // this.credentials.url = config.url;
    // this.credentials.accountId = config.accountId;
    // this.credentials.accountPassword = config.accountPassword;
    this.track = config.track;
    this.passThrough = config.passThrough;
    this.config = RED.nodes.getNode(environment === 'production' ? this.botProduction : this.bot);

    console.log('OUT node');
    console.log(this);
    console.log(config);
    console.log('END OUT node');

    this.credentials = this.credentials || {}

    if (this.config) {
      this.status({fill: 'red', shape: 'ring', text: 'disconnected'});
      node.chat = this.config.chat;
      if (node.chat) {
        this.status({fill: 'green', shape: 'ring', text: 'connected'});
      } else {
        node.warn('Missing or incomplete configuration in Hcnx Receiver');
      }
    } else {
      node.warn('Missing configuration in Hcnx Receiver');
    }

    // relay message
    var handler = function(msg) {
      node.send(msg);
    };
    RED.events.on('node:' + config.id, handler);

    // cleanup on close
    this.on('close',function() {
      RED.events.removeListener('node:' + config.id, handler);
    });

    this.on('input', function (message) {
      var context = message.chat();
      var stack = when(true);
      // check if this node has some wirings in the follow up pin, in that case
      // the next message should be redirected here
      if (context != null && node.track && !_.isEmpty(node.wires[0])) {
        stack = stack.then(function() {
          return when(context.set({
            currentConversationNode: node.id,
            currentConversationNode_at: moment()
          }));
        });
      }
      // finally send out
      stack.then(function() {
        return node.chat.send(message);
      }).then(function() {
        // forward if not tracking
        if (node.passThrough) {
          node.send(message);
        } else {
          const cloned = {...message};
          delete cloned.api;
          delete cloned.chat;
          delete cloned.client;
          delete cloned.originalMessage;
          node.send(cloned);
        }
      });
    });
  }
  registerType('chatbot-hcnx-send', HcnxOutNode,{
    credentials: {
      url: {
        type: 'text'
      },
      accountId: {
        type: 'text'
      },
      accountPassword: {
        type: 'text'
      }
    }
  });

};
