/*!
 * Module dependencies
 */
var _ = require('underscore');
var util = require('util');
var Connector = require('loopback-datasource-juggler').Connector;

/**
 * a whitelist for mongoose filter methods
 */
var filterWhitelist = [
  'where',
  'populate',
  'sort',
  'limit'
];

/**
 * Initialize the KeyStoneJS connector for the given data source
 * @param {DataSource} dataSource The data source instance
 * @param {Function} [callback] The callback function
 */
exports.initialize = function initializeDataSource(dataSource, callback) {

  var s = dataSource.settings;

  if (!s.keystone) {
    return;
  }

  dataSource.connector = new KeyStoneJS(s, dataSource);
};

/**
 * The constructor for KeyStoneJS connector
 * @param {Object} settings The settings object
 * @param {DataSource} dataSource The data source instance
 * @constructor
 */
function KeyStoneJS(settings, dataSource) {
  Connector.call(this, 'KeyStoneJS', settings);

  this.debug = settings.debug

  if (this.debug) {
    debug('Settings: %j', settings);
  }

  this.dataSource = dataSource;
  this.keystone = settings.keystone;
  this.modelPrefix = settings.modelPrefix;
  if (this.modelPrefix) {
    var modelPrefixRegex = new RegExp('^' + this.modelPrefix);
    this.removeModelPrefix = function(modelName) {
      return modelName.replace(modelPrefixRegex, '');
    };
  }
}

util.inherits(KeyStoneJS, Connector);

KeyStoneJS.prototype.getTypes = function () {
  return ['db', 'nosql', 'KeyStoneJS'];
};

KeyStoneJS.prototype.getDefaultIdType = function () {
  return String;
};

/*!
 * Convert the data from database to JSON
 *
 * @param {String} model The model name
 * @param {Object} data The data from DB
 */
KeyStoneJS.prototype.fromDatabase = function (model, data) {
  if (!data) {
    return null;
  }
  
  //TODO: do more with field metadata from the model?
  data = data._doc;

  return data;
};

/**
 * Create a new model instance for the given data
 * @param {String} model The model name
 * @param {Object} data The model data
 * @param {Function} [callback] The callback function
 */
KeyStoneJS.prototype.create = function (model, data, callback) {
  var self = this;
  if (self.debug) {
    debug('create', model, data);
  }

  if (this.modelPrefix) {
    model = this.removeModelPrefix(model);
  }

  //TODO: deal with idValue and idName

  // var idValue = self.getIdValue(model, data);
  // var idName = self.idName(model);

  // if (idValue === null) {
  //   delete data[idName]; // Allow KeyStoneJS to generate the id
  // } 

  var obj = new this.keystone.lists[model].model(data);
  obj.save(function(err) {
    callback(err); //TODO return the object id?
  });
};

/**
 * Save the model instance for the given data
 * @param {String} model The model name
 * @param {Object} data The model data
 * @param {Function} [callback] The callback function
 */
KeyStoneJS.prototype.save = function (model, data, callback) {
  var self = this;
  if (self.debug) {
    debug('save', model, data);
  }

  if (this.modelPrefix) {
    model = this.removeModelPrefix(model);
  }

  //TODO: deal with idValue and idName

  // var idValue = self.getIdValue(model, data);
  // var idName = self.idName(model);

  // if (idValue === null) {
  //   delete data[idName]; // Allow KeyStoneJS to generate the id
  // } 

  var obj = new this.keystone[model].model(data);
  obj.save(function(err) {
    callback(err); //TODO return the object id?
  });
};

/**
 * Check if a model instance exists by id
 * @param {String} model The model name
 * @param {*} id The id value
 * @param {Function} [callback] The callback function
 *
 */
KeyStoneJS.prototype.exists = function (model, id, callback) {
  var self = this;
  if (self.debug) {
    debug('exists', model, id);
  }

  if (this.modelPrefix) {
    model = this.removeModelPrefix(model);
  }

  this.keystone.lists[model].model
    .findById(id, function(err, data) {
      callback(err, !!(!err && data));
    });
};

/**
 * Find a model instance by id
 * @param {String} model The model name
 * @param {*} id The id value
 * @param {Function} [callback] The callback function
 */
KeyStoneJS.prototype.find = function find(model, id, callback) {
  var self = this;
  if (self.debug) {
    debug('find', model, id);
  }

  if (this.modelPrefix) {
    model = this.removeModelPrefix(model);
  }

  this.keystone.lists[model].model
    .findById(id, function(err, data) {
      if (err) return callback(err);

      data = self.fromDatabase(model, data);
      callback(err, data);
    });
};

/**
 * Update if the model instance exists with the same id or create a new instance
 *
 * @param {String} model The model name
 * @param {Object} data The model instance data
 * @param {Function} [callback] The callback function
 */
KeyStoneJS.prototype.updateOrCreate = function updateOrCreate(model, data, callback) {
  var self = this;
  if (self.debug) {
    debug('updateOrCreate', model, data);
  }

  var idValue = self.getIdValue(model, data);
  var idName = self.idName(model);

  if (idValue === null || idValue === undefined) {
    return this.create(model, data, callback);
  }

  this.find(model, idValue, function (err, inst) {
    if (err) {
      return callback(err);
    }
    if (inst) {
      self.updateAttributes(model, idValue, data, callback);
    } else {
      self.create(model, data, function (err, id) {
        if (err) {
          return callback(err);
        }
        if (id) {
          self.setIdValue(model, data, id);
          data && idName != '_id' && delete data._id;
          callback(null, data);
        } else {
          callback(null, null); // wtf?
        }
      });
    }
  });
};

/**
 * Delete a model instance by id
 * @param {String} model The model name
 * @param {*} id The id value
 * @param [callback] The callback function
 */
KeyStoneJS.prototype.destroy = function destroy(model, id, callback) {
  var self = this;
  if (self.debug) {
    debug('delete', model, id);
  }

  if (this.modelPrefix) {
    model = this.removeModelPrefix(model);
  }

  this.keystone.lists[model].model
    .findById(id)
    .remove(callback);
};

/**
 * Find matching model instances by the filter
 *
 * @param {String} model The model name
 * @param {Object} filter The filter
 * @param {Function} [callback] The callback function
 */
KeyStoneJS.prototype.all = function all(model, filter, callback) {
  var self = this;
  if (self.debug) {
    debug('all', model, filter);
  }

  if (!filter) {
    filter = {};
  }

  // var idName = self.idName(model);
  // var query = {};

  if (this.modelPrefix) {
    model = this.removeModelPrefix(model);
  }

  var query = this.keystone.lists[model].model.find();

  if (filter && filter.length) {
    var err;
    
    try {
      _.each(filter, function(subFilter) {
        if (!err) {
          var cmd = subFilter.shift();
          
          if (!_.contains(filterWhitelist, cmd)) {
            err = cmd + ' is not a supported filter command';
            return;
          }

          query = query[cmd].apply(query, subFilter);
        }
      });

    } catch (ex) {
      err = ex;
    }

    if (err) return callback(err);
  }
  
  query.exec(function(err, data) {
    if (err) return callback(err);

    var _data = [];
    _.each(data, function(item) {
      _data.push(self.fromDatabase(model, item));
    });

    callback(null, _data);
  });
};

/**
 * Delete all instances for the given model
 * @param {String} model The model name
 * @param {Object} [where] The filter for where
 * @param {Function} [callback] The callback function
 */
// KeyStoneJS.prototype.destroyAll = function destroyAll(model, where, callback) {
//   var self = this;
//   if (self.debug) {
//     debug('destroyAll', model, where);
//   }
//   if (!callback && 'function' === typeof where) {
//     callback = where;
//     where = undefined;
//   }
//   this.collection(model).remove(where || {}, function (err, result) {
//     if (self.debug) {
//       debug('destroyAll.callback', model, where, err, result);
//     }
//     callback && callback(err, result);
//   });
// };

/**
 * Count the number of instances for the given model
 *
 * @param {String} model The model name
 * @param {Function} [callback] The callback function
 * @param {Object} filter The filter for where
 *
 */
// KeyStoneJS.prototype.count = function count(model, callback, where) {
//   var self = this;
//   if (self.debug) {
//     debug('count', model, where);
//   }
//   this.collection(model).count(where, function (err, count) {
//     if (self.debug) {
//       debug('count.callback', model, err, count);
//     }
//     callback && callback(err, count);
//   });
// };

/**
 * Update properties for the model instance data
 * @param {String} model The model name
 * @param {Object} data The model data
 * @param {Function} [callback] The callback function
 */
// KeyStoneJS.prototype.updateAttributes = function updateAttrs(model, id, data, cb) {
//   var self = this;
//   if (self.debug) {
//     debug('updateAttributes', model, id, data);
//   }
//   var oid = ObjectID(id);
//   var idName = this.idName(model);
//   delete data[idName];
//   this.collection(model).findAndModify({_id: oid}, [
//     ['_id', 'asc']
//   ], {$set: data}, {}, function (err, object) {
//     if (self.debug) {
//       debug('updateAttributes.callback', model, id, err, object);
//     }
//     if (!err && !object) {
//       // No result
//       err = 'No ' + model + ' found for id ' + id;
//     }
//     self.setIdValue(model, object, id);
//     object && idName != '_id' && delete object._id;
//     cb && cb(err, object);
//   });
// };
