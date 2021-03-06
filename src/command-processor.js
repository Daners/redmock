'use strict';

import MessageParser from './message-parser';
import Database from './database';

const debug = require('debug')('redmock:command-processor');
const error = require('debug')('redmock:error');

/**
 * Command processor.
 */
export default class CommandProcessor {

  /**
   * Constructor.
   * @constructor
   */
  constructor() {
    error.color = 1;
    this.messageParser = new MessageParser();
    this.database = new Database();
  }

  /**
   * Process incoming commands.
   */
  process(msg, socket) {
    let commandType = this._getCommandType(msg);
    debug('Process command type of ' + commandType + ' from ' + socket.remoteAddress + ':' + socket.remotePort);
    debug(msg);
    switch (commandType) {
      case (CommandProcessor.INFO): {
        this._processInfo(msg, socket);
        break;
      }
      case (CommandProcessor.SET): {
        this._processSet(msg, socket);
        break;
      }
      case (CommandProcessor.GET): {
        this._processGet(msg, socket);
        break;
      }
      case (CommandProcessor.SELECT): {
        this._processSelect(msg, socket);
        break;
      }
      default: {
        this._processUnknownCommand(socket);
        break;
      }
    }
  }

  /**
   * Get command type.
   */
  _getCommandType(msg) {
    let commandType = null;

    // INFO
    if (msg.type == '*' && msg.length >= 1 &&
        msg.value[0].type == '$' &&
        msg.value[0].value.toUpperCase() == CommandProcessor.INFO) {
      commandType = CommandProcessor.INFO;
    } else if (msg.type == '*' && msg.length == 2 &&
               msg.value[0].type == '$' &&
               msg.value[0].value.toUpperCase() == CommandProcessor.GET) {
      commandType = CommandProcessor.GET;
    } else if (msg.type == '*' && msg.length >= 3 &&
               msg.value[0].type == '$' &&
               msg.value[0].value.toUpperCase() == CommandProcessor.SET) {
      commandType = CommandProcessor.SET;
    } else if (msg.type == '*' && msg.length == 2 &&
               msg.value[0].type == '$' &&
               msg.value[0].value.toUpperCase() == CommandProcessor.SELECT) {
      commandType = CommandProcessor.SELECT;
    }

    return commandType;
  }

  /**
   * Send message to client.
   */
  _sendMessage(msg, socket) {
    let respString = this.messageParser.toString(msg);
    debug('Send response of\n' + respString + '\nto ' + socket.remoteAddress + ':' + socket.remotePort);
    socket.write(respString);
  }

  /**
   * Send error.
   */
  _sendError(errMsg, socket) {
    let respMsg = {
      type: '-',
      value: 'ERR ' + errMsg
    };
    this._sendMessage(respMsg, socket);
  }

  /**
   * Send null reply.
   */
  _sendNullReply(socket) {
    let respMsg = {
      type: '$',
      length: -1
    };
    this._sendMessage(respMsg, socket);
  }

  /**
   * Process unknown command.
   */
  _processUnknownCommand(socket) {
    this._sendError('unknown command', socket);
  }

  /**
   * Process INFO command.
   */
  _processInfo(msg, socket) {
    let infoString = '';
    infoString += '# Server\r\n';
    infoString += 'redis_version:3.0.0\r\n';
    infoString += '# Clients\r\n';
    infoString += '# Memory\r\n';
    infoString += '# Persistence\r\n';
    infoString += '# Stats\r\n';
    infoString += '# Replication\r\n';
    infoString += '# CPU\r\n';
    infoString += '# Cluster\r\n';
    infoString += '# Keyspace\r\n';
    infoString += 'db0:keys=1997,expires=1,avg_ttl=98633637897';

    // Generate our info message
    let respMsg = {
      type: '$',
      length: infoString.length,
      value: infoString
    };
    this._sendMessage(respMsg, socket);
  }

  /**
   * Process SELECT command.
   */
  _processSelect(msg, socket) {
    let db = msg.value[1].value;
    debug('Selecting database: ' + db);
    socket.database = db;
    this.database.createDatabase(db);
    let respMsg = {
      type: '+',
      value: 'OK'
    };
    this._sendMessage(respMsg, socket);
  }

  /**
   * Process GET command.
   */
  _processGet(msg, socket) {
    let key = msg.value[1].value;
    debug('Get ' + key);

    let value = this.database.get(key, socket.database);
    if (value) {
      let respMsg = {
        type: '$',
        length: value.value.length,
        value: value.value
      };
      this._sendMessage(respMsg, socket);
    } else {
      this._sendNullReply(socket);
    }
  }

  /**
   * Process SET command.
   */
  _processSet(msg, socket) {
    let respMsg = {
      type: '+',
      value: 'OK'
    };
    let key = msg.value[1].value;
    let value = msg.value[2].value;
    debug('Set ' + key + ' to %j', value);
    let options = {
      expiresIn: -1,
      notExists: false,
      exists: false
    };
    // Go throuh options and set them
    for (let i = 3; i < msg.value.length; i++) {
      debug('Process SET optinon of %j', msg.value[i]);
      if (msg.value[i].value == 'NX') {
        debug('Setting SET option notExists to true');
        options.notExists = true;
      } else if (msg.value[i].value == 'XX') {
        debug('Setting SET option exists to true');
        options.exists = true;
      } else if (msg.value[i].value == 'EX') {
        let expiresIn = parseInt(msg.value[i + 1].value);
        debug('Setting SET option expiresIn to ' + expiresIn);
        i += 1;
        options.expiresIn = expiresIn;
      } else if (msg.value[i].value == 'PX') {
        let expiresIn = parseInt(msg.value[i + 1].value) / 1000;
        debug('Setting SET option expiresIn to ' + expiresIn);
        i += 1;
        options.expiresIn = expiresIn;
      } else {
        debug('Skipping unknown option');
        continue;
      }
    }
    if (this.database.set(key, value, socket.database, options)) {
      this._sendMessage(respMsg, socket);
    } else {
      error('Failed to set');
      this._sendNullReply(socket);
    }
  }

  static get INFO() {
    return 'INFO';
  }

  static get SELECT() {
    return 'SELECT';
  }

  static get SET() {
    return 'SET';
  }

  static get GET() {
    return 'GET';
  }

}
