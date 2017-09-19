
Instant.clientData = function() {
  /* Local cache */
  var data = null;
  /* The pending request for client data, or null. */
  var pending = null;
  /* Callbacks for the request */
  var callbacks = [];
  /* Send a data request */
  function sendRequest() {
    if (pending != null) return;
    pending = Instant.connection.sendSeq({type: 'get-cdata'});
  }
  /* Handle a response */
  function handleResponse(msg) {
    if (msg.seq != null && msg.seq != pending) {
      return (msg.type == 'cdata');
    }
    if (msg.type == 'error') console.error('Could not set client data:', msg);
    try {
      if (msg.data.data) {
        data = JSON.parse(msg.data.data);
      } else {
        data = {};
      }
    } catch (e) {
      console.error(e);
      data = {};
    }
    pending = null;
    callbacks.forEach(function(cb) {
      cb(msg);
    });
    callbacks = [];
    return true;
  }
  /* Listen for responses */
  Instant.connection.addRawHandler('cdata', handleResponse);
  Instant.connection.addRawHandler('error', handleResponse);
  return {
    /* Return client data
     * If force is true or data are not present (yet), a fresh copy is
     * fetched from the server unconditionally, and null is returned. */
    get: function(force) {
      if (data == null || force) {
        sendRequest();
        return null;
      }
      return data;
    },
    /* Get client data asynchronously; return a Promise */
    getAsync: function(force) {
      return new Promise(function(resolve, reject) {
        if (data != null && ! force) {
          resolve(data);
          return;
        }
        callbacks.push(function(msg) {
          if (msg.type == 'cdata') {
            resolve(data);
          } else {
            reject(msg);
          }
        });
        sendRequest();
      });
    },
    /* Submit data for setting */
    set: function() {
      Instant.connection.sendSeq({type: 'set-cdata',
        data: {data: JSON.stringify(data)}});
    }
  };
}();
