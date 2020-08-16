
/* Instant video chat plugin functionality */

Instant.webrtc = function() {
  /* The user identity. Stays stable while the page is loaded. */
  var identity = null;
  /* Counter for connection ID-s. */
  var idCounter = 1;
  /* The current configuration. */
  var configuration = {};
  return {
    /* Initialize submodule. */
    init: function() {
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
    /* Create and return an RTCPeerConnection, setting it up to negotiate
     * with a remote counterpart created by this function as well.
     * setSignalFrom is a setter function that takes an event handler function
     *               and installs it such that it is called whenever a
     *               singaling datum from the counterpart arrives. This is
     *               called while the _createConnection() call is underway,
     *               exactly once.
     * signalTo      is a function that takes singaling datum and relays it
     *               the counterpart.
     * peerFlag      is a Boolean that should be true on one peer and false on
     *               the other. For example, the peer initiating the
     *               connection could set this to true; then, the other peer
     *               would set this to false.
     * Returns an appropriately configured RTCPeerConnection object. */
    _createConnection: function(setSignalFrom, signalTo, peerFlag) {
      var ret = new RTCPeerConnection(configuration);
      // Perfect (WebRTC) negotiation pattern as described on MDN. The code
      // behaves "politely" iff peerFlag is true.
      sendingOffer = false;
      offerIgnored = false;
      ret.addEventListener('negotiationneeded', function(event) {
        // Whenever (re)negotiation is required, we update the local
        // description and send it off.
        sendingOffer = true;
        ret.setLocalDescription().then(function() {
          signalTo({type: 'description', data: ret.localDescription});
        }).catch(function(err) {
          console.error('WebRTC: Error while submitting local description:',
                        err);
        }).finally(function() {
          sendingOffer = false;
        });
      });
      ret.addEventListener('icecandidate', function(event) {
        // Candidates are forwarded to the other side.
        signalTo({type: 'candidate', data: event.candidate});
      });
      setSignalFrom(function(data) {
        var promise;
        if (data.type == 'description') {
          // Incoming descriptions are subject to a collision check.
          var description = data.data;
          var collision = ((description.type == 'offer') &&
            (sendingOffer || ret.signalingState != 'stable'));
          offerIgnored = (collision && ! peerFlag);
          if (offerIgnored) return;
          // Accepted descriptions are passed on; offers are answered.
          promise = pc.setRemoteDescription(description).then(function() {
            if (description.type != 'offer') return;
            return ret.setLocalDescription().then(function() {
              signalTo({type: 'description', data: ret.localDescription});
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
      return ret;
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
