
/* Instant video chat plugin functionality */

Instant.webrtc = function() {
  /* The current configuration. */
  var configuration = {};
  return {
    /* Retrieve the current RTCPeerConnection configuration object. */
    getRTCConfiguration: function() {
      return configuration;
    },
    /* Set the configuration object used for creating RTCPeerConnection-s. */
    setRTCConfiguration: function(config) {
      configuration = config;
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
