
/* Instant video chat plugin functionality */

Instant.webrtc = function() {
  /* The user identity. Stays stable while the page is loaded. */
  var identity = null;
  /* The current configuration. */
  var configuration = {};
  /* Connection storage. */
  var connections = {};
  return {
    /* Initialize submodule. */
    init: function() {
      Instant.connection.addHandler('p2p-signal', function(msg) {
        Instant.webrtc._onmessage(msg);
        return true;
      });
      Instant.listen('identity.established', function(event) {
        if (identity == null) identity = Instant.identity.id;
      });
    },
    /* Return whether the module is ready for use.
     * Until this returns true, no functions (but init() and isReady()) should
     * be called. */
    isReady: function() {
      return (identity != null);
    },
    /* Retrieve this client's P2P identity.
     * The identity is set when we first connect to the Instant API, and stays
     * stable until the page is reloaded. */
    getIdentity: function() {
      return identity;
    },
    /* Retrieve the current RTCPeerConnection configuration object. */
    getRTCConfiguration: function() {
      return configuration;
    },
    /* Create a WebRTC connection to the given peer and return it. */
    connectTo: function(peerID) {
      var connID = Instant.webrtc._calcConnectionID(peerID);
      if (! connections[connID])
        Instant.webrtc._createConnection(connID, peerID);
      return connections[connID];
    },
    /* Retrieve the connection with the given ID, or null if there is none. */
    getConnection: function(connID) {
      return connections[connID] || null;
    },
    /* Retrieve the ID of the given RTCPeerConnection.
     * The object must have been created by connectTo(). */
    getConnectionID: function(conn) {
      return conn._instant.id;
    },
    /* Create a media stream object capturing audio and/or video from the
     * user.
     * The return value is a Promise, which may resolve, reject, or do
     * neither. */
    getUserMedia: function(audio, video) {
      if (! navigator.mediaDevices) {
        return Promise.reject(new Error('Media device API unavailable'));
      }
      try {
        return navigator.mediaDevices.getUserMedia({audio: audio,
                                                    video: video});
      } catch (exc) {
        return Promise.reject(exc);
      }
    },
    /* Create and return  a <video> element displaying the media from the
     * given stream. */
    displayMedia: function(stream) {
      var ret = document.createElement('video');
      if ('srcObject' in ret) {
        ret.srcObject = stream;
      } else {
        ret.src = URL.createObjectURL(stream);
      }
      return ret;
    },
    /* Calculate the unique ID of any connection between this peer and the
     * one named by peerID. */
    _calcConnectionID: function(peerID) {
      if (peerID < identity) {
        return peerID + ':' + identity;
      } else {
        return identity + ':' + peerID;
      }
    },
    /* Create, install, and return a fully configured RTCPeerConnection.
     * The connection has the given ID and communicates with the peer whose
     * ID is given as well. */
    _createConnection: function(connID, peerID) {
      var ret = new RTCPeerConnection(configuration);
      ret._instant = {id: connID, onSignalingInput: null};
      Instant.webrtc._negotiate(ret, function(handler) {
          ret._instant.onSignalingInput = handler;
        }, function(data) {
          Instant.connection.sendUnicast(peerID, {type: 'p2p-signal',
            connection: connID, data: data});
        }, peerFlag);
      connections[connID] = ret;
      return ret;
    },
    /* Configure the given RTCPeerConnection to negotiate with a counterpart
     * calling this function as well.
     * setSignalFrom is a setter function that takes an event handler function
     *               and installs it such that it is called whenever a
     *               singaling datum from the counterpart arrives. This is
     *               called while the _negotiate() call is underway, exactly
     *               once.
     * signalTo      is a function that takes singaling datum and relays it
     *               the counterpart.
     * peerFlag      is a Boolean that should be true on one peer and false on
     *               the other. For example, the peer initiating the
     *               connection could set this to true; then, the other peer
     *               would set this to false. */
    _negotiate: function(conn, setSignalFrom, signalTo, peerFlag) {
      // Perfect (WebRTC) negotiation pattern as described on MDN. The code
      // behaves "politely" iff peerFlag is true.
      sendingOffer = false;
      offerIgnored = false;
      conn.addEventListener('negotiationneeded', function(event) {
        // Whenever (re)negotiation is required, we update the local
        // description and send it off.
        sendingOffer = true;
        conn.setLocalDescription().then(function() {
          signalTo({type: 'description', data: conn.localDescription});
        }).catch(function(err) {
          console.error('WebRTC: Error while submitting local description:',
                        err);
        }).finally(function() {
          sendingOffer = false;
        });
      });
      conn.addEventListener('icecandidate', function(event) {
        // Candidates are forwarded to the other side.
        signalTo({type: 'candidate', data: event.candidate});
      });
      setSignalFrom(function(data) {
        var promise;
        if (data.type == 'description') {
          // Incoming descriptions are subject to a collision check.
          var description = data.data;
          var collision = ((description.type == 'offer') &&
            (sendingOffer || conn.signalingState != 'stable'));
          offerIgnored = (collision && ! peerFlag);
          if (offerIgnored) return;
          // Accepted descriptions are passed on; offers are answered.
          promise = pc.setRemoteDescription(description).then(function() {
            if (description.type != 'offer') return;
            return conn.setLocalDescription().then(function() {
              signalTo({type: 'description', data: conn.localDescription});
            });
          });
        } else if (data.type == 'candidate') {
          // Candidates are fed back into WebRTC.
          promise = pc.addIceCandidate(data.data);
        } else {
          return;
        }
        // Common error handler.
        promise.catch(function(err) {
          if (data.type == 'candidate' && offerIgnored) return;
          console.error('WebRTC: Error while handling incoming ' + data.type +
                        ':', err);
        });
      });
    },
    /* Handle an incoming (Instant client-to-client) message. */
    _onmessage: function(msg) {
      var data = msg.data;
      switch (data.type) {
        case 'p2p-signal':
          var connID = data.connection;
          if (! connID) {
            console.warn('WebRTC: Invalid signaling message received:', msg);
            break;
          }
          // Reception of a signaling event creates a new connection if
          // necessary.
          if (! connections[connID])
            Instant.webrtc._createConnection(connID, msg.from);
          connections[connID]._instant.onSignalingInput(data.data);
          break;
        default:
          console.warn('WebRTC: Unknown client message?!', data);
          break;
      }
    },
    /* Add or remove highlighting on this user list entry. */
    _setHighlight: function(userNode, newState) {
      if (newState) {
        userNode.classList.add('highlight');
      } else {
        userNode.classList.remove('highlight');
      }
    }
  };
}();
