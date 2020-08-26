
/* Instant video chat plugin functionality */

Instant.webrtc = function() {
  /* The user identity. Stays stable while the page is loaded. */
  var identity = null;
  /* Mappings between P2P peer ID-s and Instant session ID-s. */
  var peers = {}, peerSessions = {};
  /* The current WebRTC configuration. */
  var configuration = {};
  /* Connection storage. */
  var connections = {};
  /* Mapping from connection ID-s to GC deadlines. */
  var gcDeadlines = {};
  /* Buffered singaling data. Non-null when there is no connection. */
  var signalBuffer = null;
  return {
    /* Time after which an errored-out connection should be discarded. */
    GC_TIMEOUT: 60000,
    /* How often the GC should run. */
    GC_GRANULARITY: 'm',
    /* Initialize submodule. */
    init: function() {
      function handleMessage(msg) {
        Instant.webrtc._onmessage(msg);
        return true;
      }
      Instant.connection.addHandler('p2p-query', handleMessage);
      Instant.connection.addHandler('p2p-announce', handleMessage);
      Instant.connection.addHandler('p2p-signal', handleMessage);
      Instant.listen('identity.established', function(event) {
        if (identity == null) {
          identity = Instant.identity.uuid + ':' + Instant.identity.id;
        }
        Instant.webrtc._sendAnnounce(null);
        Instant.connection.sendBroadcast({type: 'p2p-query'});
        Instant.webrtc._flushSignalBuffer();
      });
      Instant.listen('connection.close', function(event) {
        signalBuffer = {};
      });
      Instant.timers.add(Instant.webrtc._doGC.bind(Instant.webrtc),
                         Instant.webrtc.GC_GRANULARITY);
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
    /* Create a WebRTC connection to the given peer and return it.
     * If the peer has not announced its WebRTC support and force is not true,
     * an error is thrown instead. */
    connectTo: function(peerID, force) {
      if (! (force || peerSessions[peerID]))
        throw new Error('Invalid peer ' + peerID);
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
        return peerID + '/' + identity;
      } else {
        return identity + '/' + peerID;
      }
    },
    /* Create, install, and return a fully configured RTCPeerConnection.
     * The connection has the given ID and communicates with the peer whose
     * identity is given as well. */
    _createConnection: function(connID, peerID) {
      var ret = new RTCPeerConnection(configuration);
      var peerFlag = connID.startsWith(identity + ':');
      ret._instant = {id: connID, onSignalingInput: null};
      Instant.webrtc._negotiate(ret, function(handler) {
          ret._instant.onSignalingInput = handler;
        }, function(data) {
          Instant.webrtc._sendSignal(peerID, {type: 'p2p-signal',
            provider: 'webrtc', connection: connID, data: data});
        }, peerFlag);
      connections[connID] = ret;
      return ret;
    },
    /* Remove the connection with the given ID. */
    _removeConnection: function(connID) {
      var conn = connections[connID];
      if (conn) conn.close();
      delete connections[connID];
      delete gcDeadlines[connID];
    },
    /* Configure the given connection to be garbage-collected in the future
     * (if remove is true), or not (otherwise). */
    _setConnGC: function(connID, remove) {
      if (! connections[connID]) {
        /* NOP */
      } else if (remove) {
        gcDeadlines[connID] = Date.now() + Instant.webrtc.GC_TIMEOUT;
      } else {
        delete gcDeadlines[connID];
      }
    },
    /* Perform a single run of the connection GC. */
    _doGC: function() {
      var now = Date.now();
      for (var connID in gcDeadlines) {
        if (! gcDeadlines.hasOwnProperty(connID)) continue;
        var deadline = gcDeadlines[connID];
        if (deadline <= now) continue;
        Instant.webrtc._removeConnection(connID);
      }
      return Instant.webrtc.GC_GRANULARITY;
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
     *               the other. */
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
    /* Send an announcement of our P2P support to the given receiver
     * (defaulting to everyone). */
    _sendAnnounce: function(receiver) {
      Instant.connection.send(receiver, {type: 'p2p-announce',
        identity: identity, providers: ['webrtc']});
    },
    /* Send an (already-wrapped) signaling message to the peer with the given
     * identity. */
    _sendSignal: function(receiver, msg) {
      function callback(msg) {
        if (msg.type != 'error') return;
        if (receiverSID) {
          delete peers[receiverSID];
          if (peerSessions[receiver] == receiverSID) {
            delete peerSessions[receiver];
          }
        }
        Instant.webrtc._setConnGC(msg.connection, true);
      }
      // If there is no Instant connection, we buffer signaling messages.
      if (signalBuffer) {
        if (! signalBuffer[receiver]) {
          signalBuffer[receiver] = [msg];
        } else {
          signalBuffer[receiver].push(msg);
        }
        return;
      }
      // Otherwise, we submit them.
      var receiverSID = peerSessions[receiver];
      if (receiverSID) {
        Instant.connection.sendUnicast(receiverSID, msg, callback);
      } else {
        callback({type: 'error'});
      }
    },
    /* Internal: Actually submit buffered singaling information. */
    _flushSignalBuffer: function() {
      var buffered = signalBuffer;
      signalBuffer = null;
      for (var peerIdent in buffered) {
        if (! buffered.hasOwnProperty(peerIdent)) continue;
        var messages = buffered[peerIdent];
        for (var i = 0; i < messages.length; i++) {
          Instant.webrtc._sendSignal(peerIdent, messages[i]);
        }
      }
    },
    /* Handle an incoming (Instant client-to-client) message. */
    _onmessage: function(msg) {
      var data = msg.data;
      switch (data.type) {
        case 'p2p-query': /* Someone is asking whether we support WebRTC. */
          Instant.webrtc._sendAnnounce(msg.from);
          break;
        case 'p2p-announce': /* Someone is telling us they support WebRTC. */
          // Ignore announcements from ourself -- the negotiation algorithm
          // breaks when both peers are the same.
          if (msg.from == identity) break;
          // Validate the offered provider(s).
          var providers = data.providers || [];
          if (providers.indexOf('webrtc') == -1) break;
          // Sanity-check its identity.
          var peerIdent = data.identity;
          if (typeof peerIdent != 'string') break;
          var peerUUID = Instant.logs.getUUID(msg.from);
          if (! peerUUID) break;
          if (! peerIdent.startsWith(peerUUID + ':')) break;
          // Finally, register the peer.
          peers[msg.from] = peerIdent;
          peerSessions[peerIdent] = msg.from;
          break;
        case 'p2p-signal': /* Someone is trying to connect to us. */
          if (data.provider != 'webrtc') {
            console.warn('WebRTC: Invalid signaling message received (wrong '
                         'provider):', msg);
            break;
          }
          var connID = data.connection;
          if (! connID) {
            console.warn('WebRTC: Invalid signaling message received (no '
                         'connection ID):', msg);
            break;
          }
          // Reception of a signaling event creates a new connection if
          // necessary, and definitely clears the GC flag.
          if (! connections[connID])
            Instant.webrtc._createConnection(connID, msg.from);
          connections[connID]._instant.onSignalingInput(data.data);
          Instant.webrtc._setConnGC(connID, false);
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
