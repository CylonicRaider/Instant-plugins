
/* Instant video chat plugin functionality */

Instant.webrtc = function() {
  /* For debugging. */
  function trace(msg) {
    if (window.logInstantWebRTC)
      console.debug.apply(console, ['[WebRTC]'].concat(
        Array.prototype.slice.call(arguments)));
  }
  /* An object enclosing an RTCPeerConnection connection, along with its
   * control channel and assorted metadata. */
  function Connection(id, peer) {
    this.connection = null;
    this.control = null;
    this.id = id;
    this.peer = peer;
    this.tag = '->' + (peerSessions[this.peer] ||
                       this.peer.replace(/^[0-9a-fA-F-]+:/, "")) + ':';
    this._controlListeners = new Instant.util.EventDispatcher();
    this._closeListeners = new Instant.util.EventTracker();
    this._init();
  }
  Connection.prototype = {
    /* Actually create the underlying RTCPeerConnection and the control
     * channel. */
    _init: function() {
      var self = this;
      this.connection = new RTCPeerConnection(configuration);
      this.connection._instant = this;
      Instant.webrtc._negotiate(this.connection, function(handler) {
          self._onSignalingInput = handler;
        }, function(data) {
          trace(self.tag, 'Signaling out:', data);
          Instant.webrtc._sendSignal(self.peer, {type: 'p2p-signal',
            provider: 'webrtc', connection: self.id, data: data});
        }, this.id.startsWith(identity + '/'));
      this.control = this.connection.createDataChannel('control',
        {negotiated: true, id: 0});
      this.control.addEventListener('open', function(evt) {
        trace(self.tag, 'Control channel open');
      });
      this.control.addEventListener('message', function(evt) {
        self._onControlMessage(evt.data);
      });
      this.control.addEventListener('close', function(evt) {
        trace(self.tag, 'Control channel closed');
        self.close();
      });
      this.control.addEventListener('error', function(evt) {
        console.warn('WebRTC: Control channel error:', evt);
      });
    },
    /* Counterpart of _init(). */
    _close: function() {
      if (this.control != null) this.control.close();
      if (this.connection != null) this.connection.close();
      if (this._closeListeners != null) this._closeListeners.fire(this, this);
      this.control = null;
      this.connection = null;
      this._closeListeners = null;
    },
    /* Send an arbitrarily structured control message.
     * The message is JSON-stringified before actually being sent. */
    sendRawControlMessage: function(msg) {
      this.control.send(JSON.stringify(msg));
    },
    /* Send a control message with the given type and data. */
    sendControlMessage: function(type, data) {
      this.sendRawControlMessage({type: type, data: data});
    },
    /* Close the connection. */
    close: function() {
      Instant.webrtc._removeConnection(this.id);
      this._close();
    },
    /* Add a listener for control messages of the given type. */
    listenControl: function(type, cb) {
      this._controlListeners.listen(type, cb);
    },
    /* Remove a control message listener. */
    unlistenControl: function(type, cb) {
      this._controlListeners.unlisten(type, cb);
    },
    /* Call the given callback when the connection is closed. */
    listenClose: function(cb) {
      if (this._closeListeners != null) {
        this._closeListeners.listen(cb);
      } else {
        cb.call(this, this);
      }
    },
    /* Remove the given on-close callback. */
    unlistenClose: function(cb) {
      if (this._closeListeners != null) this._closeListeners.unlisten(cb);
    },
    /* Handle signaling input.
     * Overridden by a per-instance closure in _init(). */
    _onSignalingInput: function(data) {
      throw new Error('Sending signaling data to uninitialized Connection?!');
    },
    /* Handle a message arriving on the control channel. */
    _onControlMessage: function(text) {
      var msg;
      try {
        msg = JSON.parse(text);
        if (typeof msg != 'object') throw 'Not an object';
      } catch (e) {
        console.warn('WebRTC: Cannot parse control message:', e);
        return;
      }
      var type = msg.type;
      if (! type) {
        console.warn('WebRTC: Invalid control message (missing type):', msg);
        return;
      }
      this._controlListeners.fire(msg.type, this, msg, this);
      Instant.webrtc._onControlMessage(msg, this);
    }
  };
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
  /* Buffered singaling data. Non-null when there is no (Instant)
   * connection. */
  var signalBuffer = null;
  /* Global control message listeners. */
  var globalControlListeners = new Instant.util.EventDispatcher();
  return {
    /* Time after which an errored-out connection should be discarded. */
    GC_TIMEOUT: 60000,
    /* How often the GC should run. */
    GC_GRANULARITY: 'm',
    /* Initialize submodule. */
    init: function() {
      function handleIdentity() {
        if (identity == null ||
            Instant.identity.uuid != identity.replace(/:.*$/, "")) {
          identity = Instant.identity.uuid + ':' + Instant.identity.id;
        }
        Instant.connection.sendSeq({type: 'who'}, function(msg) {
          cleanUpPeers(msg.data);
        });
        Instant.webrtc._sendAnnounce(null);
        Instant.connection.sendBroadcast({type: 'p2p-query'});
        Instant.webrtc._flushSignalBuffer();
        Instant._fireListeners('webrtc.init');
      }
      function handleMessage(msg) {
        Instant.webrtc._onmessage(msg);
        return true;
      }
      function cleanUpPeers(who) {
        for (var sid in peers) {
          if (! peers.hasOwnProperty(sid)) continue;
          if (who.hasOwnProperty(sid)) continue;
          Instant.webrtc._removePeer(peers[sid], sid);
        }
      }
      Instant.query.initVerboseFlag(window, 'logInstantWebRTC', 'webrtc');
      Instant.connection.addRawHandler('identity', function() {
        return handleIdentity;
      });
      Instant.connection.addHandler('p2p-query', handleMessage);
      Instant.connection.addHandler('p2p-announce', handleMessage);
      Instant.connection.addHandler('p2p-signal', handleMessage);
      Instant.listen('connection.close', function(event) {
        signalBuffer = {};
      });
      Instant.timers.add(Instant.webrtc._doGC.bind(Instant.webrtc),
                         Instant.webrtc.GC_GRANULARITY);
      if (Instant.identity.id != null) handleIdentity();
      Instant.webrtc.ui.init();
      Instant.webrtc.chat.init();
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
    /* Retrieve the P2P identity of the peer with the given session ID, if
     * any. */
    getPeerIdentity: function(sid) {
      return peers[sid];
    },
    /* Retrieve the current Instant session ID of the peer with the given P2P
     * identity, if any. */
    getPeerSID: function(ident) {
      return peerSessions[ident];
    },
    /* Add a global listener for control messages. */
    addGlobalControlListener: function(type, listener) {
      globalControlListeners.listen(type, listener);
    },
    /* Remove a global control message listener. */
    removeGlobalControlListener: function(type, listener) {
      globalControlListeners.unlisten(type, listener);
    },
    /* Create a WebRTC connection to the given peer and return it.
     * If the peer has not announced its WebRTC support and force is not true,
     * an error is thrown instead. */
    connectTo: function(peerIdent, force) {
      if (! (force || peerSessions[peerIdent]))
        throw new Error('Invalid peer ' + peerIdent);
      var connID = Instant.webrtc._calcConnectionID(peerIdent);
      if (! connections[connID])
        Instant.webrtc._createConnection(connID, peerIdent);
      return connections[connID];
    },
    /* Retrieve the connection with the given ID, or null if there is none. */
    getConnection: function(connID) {
      return connections[connID] || null;
    },
    /* Retrieve the connection with the given peer, if any. */
    getConnectionWith: function(peerIdent) {
      var connID = Instant.webrtc._calcConnectionID(peerIdent);
      return connections[connID] || null;
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
    /* Stop the given stream's media transmission. */
    closeMedia: function(stream) {
      stream.getTracks().forEach(function(track) {
        track.stop();
      });
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
      ret.autoplay = true;
      return ret;
    },
    /* Calculate the unique ID of any connection between this peer and the
     * one named by peerIdent. */
    _calcConnectionID: function(peerIdent) {
      if (peerIdent < identity) {
        return peerIdent + '/' + identity;
      } else {
        return identity + '/' + peerIdent;
      }
    },
    /* Create, install, and return a fully configured RTCPeerConnection.
     * The connection has the given ID and communicates with the peer whose
     * identity is given as well. */
    _createConnection: function(connID, peerIdent) {
      var conn = new Connection(connID, peerIdent);
      connections[connID] = conn;
      Instant._fireListeners('webrtc.conn.open', {connection: conn});
    },
    /* Remove the connection with the given ID. */
    _removeConnection: function(connID) {
      var conn = connections[connID];
      if (conn) {
        Instant._fireListeners('webrtc.conn.close', {connection: conn});
        conn._close();
      }
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
    /* Register the peer with the given identity and (Instant) session ID. */
    _addPeer: function(ident, sid) {
      var oldSID = peerSessions[ident];
      if (oldSID) delete peers[oldSID];
      peers[sid] = ident;
      peerSessions[ident] = sid;
      Instant._fireListeners('webrtc.peer.new', {identity: ident,
                                                 session: sid});
    },
    /* Remove the peer with the given identity and the given session ID.
     * If the peer already exists but has a different session ID, it is left
     * in place (but the mapping from the session ID passed to this function
     * is removed). */
    _removePeer: function(ident, sid) {
      if (sid) {
        delete peers[sid];
      }
      if (ident && peerSessions[ident] == sid) {
        delete peerSessions[ident];
        Instant._fireListeners('webrtc.peer.remove', {identity: ident,
                                                      session: sid});
      }
    },
    /* Configure the given RTCPeerConnection to negotiate with a counterpart
     * calling this function as well.
     * setSignalFrom is a setter function that takes an event handler function
     *               and installs it such that it is called whenever a
     *               singaling datum from the counterpart arrives. This is
     *               called while the _negotiate() call is underway, exactly
     *               once.
     * signalTo      is a function that takes a singaling datum and relays it
     *               the counterpart.
     * peerFlag      is a Boolean that should be true on one peer and false on
     *               the other. */
    _negotiate: function(conn, setSignalFrom, signalTo, peerFlag) {
      function autoSetLocalDescription(conn) {
        return conn.setLocalDescription().catch(function(err) {
          console.warn('WebRTC: Error while auto-creating local ' +
            'description; re-trying manually...', err);
          // Old browsers do not have argument-less setLocalDescription().
          var promise;
          if (conn.signalingState == 'stable' ||
              conn.signalingState == 'have-local-offer' ||
              conn.signalingState == 'have-remote-pranswer') {
            promise = conn.createOffer();
          } else {
            promise = conn.createAnswer();
          }
          return promise.then(function(desc) {
            return conn.setLocalDescription(desc);
          });
        });
      }
      function addStateTracker(conn, propName) {
        conn.addEventListener(propName.toLowerCase() + 'change',
          function(evt) {
            trace(connTag, propName, 'changed to', conn[propName]);
          });
      }
      // Connection ID for debugging.
      var connTag = (conn._instant) ? conn._instant.tag : '<anonymous>:';
      // Perfect (WebRTC) negotiation pattern as described on MDN. The code
      // behaves "politely" iff peerFlag is true.
      var sendingOffer = false;
      var offerIgnored = false;
      conn.addEventListener('negotiationneeded', function(event) {
        trace(connTag, 'Negotiating...');
        // Whenever (re)negotiation is required, we update the local
        // description and send it off.
        sendingOffer = true;
        autoSetLocalDescription(conn).then(function() {
          signalTo({type: 'description', data: conn.localDescription});
        }).catch(function(err) {
          console.error('WebRTC: Error while submitting local description:',
                        err);
        }).finally(function() {
          sendingOffer = false;
        });
      });
      conn.addEventListener('icecandidate', function(event) {
        if (! event.candidate) return;
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
          promise = conn.setRemoteDescription(description).then(function() {
            if (description.type != 'offer') return;
            return autoSetLocalDescription(conn).then(function() {
              signalTo({type: 'description', data: conn.localDescription});
            });
          });
        } else if (data.type == 'candidate') {
          // Candidates are fed back into WebRTC.
          promise = conn.addIceCandidate(data.data);
        } else {
          console.warn('WebRTC: Unrecognized signaling data:', data);
          return;
        }
        // Common error handler.
        promise.catch(function(err) {
          if (data.type == 'candidate' && offerIgnored) return;
          console.error('WebRTC: Error while handling incoming ' + data.type +
                        ':', err);
        });
      });
      // More debugging.
      addStateTracker(conn, 'connectionState');
      addStateTracker(conn, 'iceConnectionState');
      addStateTracker(conn, 'signalingState');
    },
    /* Send an announcement of our P2P support to the given receiver
     * (defaulting to everyone). */
    _sendAnnounce: function(receiver) {
      var announce = {type: 'p2p-announce', identity: identity,
                      providers: ['webrtc']};
      Instant._fireListeners('webrtc.announce', {message: announce,
                                                 to: receiver});
      Instant.connection.send(receiver, announce);
    },
    /* Send an (already-wrapped) signaling message to the peer with the given
     * identity. */
    _sendSignal: function(peerIdent, msg) {
      function callback(msg) {
        if (msg.type != 'error') return;
        Instant.webrtc._removePeer(peerIdent, receiverSID);
        var connID = Instant.webrtc._calcConnectionID(peerIdent);
        Instant.webrtc._setConnGC(connID, true);
      }
      // If there is no Instant connection, we buffer signaling messages.
      if (signalBuffer) {
        if (! signalBuffer[peerIdent]) {
          signalBuffer[peerIdent] = [msg];
        } else {
          signalBuffer[peerIdent].push(msg);
        }
        return;
      }
      // Otherwise, we submit them.
      var receiverSID = peerSessions[peerIdent];
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
          // Do not send announcements if we are not ready yet.
          if (identity == null) break;
          Instant.webrtc._sendAnnounce(msg.from);
          break;
        case 'p2p-announce': /* Someone is telling us they support WebRTC. */
          // Ignore announcements from ourself -- the negotiation algorithm
          // breaks when both peers are the same.
          if (msg.from == Instant.identity.id) break;
          // Validate the offered provider(s).
          var providers = data.providers || [];
          if (providers.indexOf('webrtc') == -1) {
            // Allow de-announcing support.
            Instant.webrtc._removePeer(peers[msg.from], msg.from);
            break;
          }
          // Sanity-check its identity.
          var peerIdent = data.identity;
          if (typeof peerIdent != 'string') break;
          var peerUUID = Instant.logs.getUUID(msg.from);
          if (! peerUUID) break;
          if (! peerIdent.startsWith(peerUUID + ':')) break;
          // Finally, register the peer.
          Instant.webrtc._addPeer(peerIdent, msg.from);
          break;
        case 'p2p-signal': /* Someone is trying to connect to us. */
          if (data.provider != 'webrtc') {
            console.warn('WebRTC: Invalid signaling message received ' +
                         '(wrong provider):', msg);
            break;
          }
          var connID = data.connection;
          if (! connID) {
            console.warn('WebRTC: Invalid signaling message received (no ' +
                         'connection ID):', msg);
            break;
          }
          // Reception of a signaling event creates a new connection if
          // necessary, and definitely clears the GC flag.
          if (! connections[connID]) {
            var peerIdent = peers[msg.from];
            if (! peerIdent) {
              console.warn('WebRTC: Invalid signaling message received ' +
                '(unknown peer identity):', msg);
              break;
            }
            Instant.webrtc._createConnection(connID, peerIdent);
          }
          var conn = connections[connID];
          trace(conn.tag, 'Signaling in:', data.data);
          conn._onSignalingInput(data.data);
          Instant.webrtc._setConnGC(connID, false);
          break;
        default:
          console.warn('WebRTC: Unknown client message?!', data);
          break;
      }
    },
    /* Handle an incoming control channel message */
    _onControlMessage: function(msg, conn) {
      globalControlListeners.fire(msg.type, conn, msg, conn);
    },
    /* Add or remove highlighting on this user list entry. */
    _setHighlight: function(sid, newState) {
      var userNode = Instant.userList.get(sid);
      if (newState) {
        userNode.classList.add('highlight');
      } else {
        userNode.classList.remove('highlight');
      }
    },
    /* Video sharing UI. */
    ui: function() {
      /* Sharing window. */
      var shareWin = null;
      /* The media stream currently being previewed. */
      var previewStream = null;
      return {
        /* Initialize submodule. */
        init: function() {
          shareWin = Instant.popups.windows.make({
            title: 'Video sharing',
            className: 'video-config',
            content: $makeFrag(
              ['div', 'popup-grid-wrapper', [
                ['div', 'popup-grid', [
                  ['b', null, 'Share: '],
                  ['form', 'popup-grid-wide video-type', [
                    ['label', [
                      ['input', {type: 'radio', name: 'type', value: 'a'}],
                      'Audio'
                    ]], ' ',
                    ['label', [
                      ['input', {type: 'radio', name: 'type', value: 'v'}],
                      'Video'
                    ]], ' ',
                    ['label', [
                      ['input', {type: 'radio', name: 'type', value: 'av',
                        checked: 'checked'}],
                      'Both'
                    ]]
                  ]]
                ]]
              ]],
              ['div', 'video-preview']
            ),
            buttons: [
              {text: 'Preview', onclick: function() {
                shareWin.classList.add('has-preview');
                Instant.webrtc.ui.updatePreview();
              }, className: 'show-preview'},
              {text: 'Hide preview', onclick: function() {
                shareWin.classList.remove('has-preview');
                Instant.webrtc.ui.updatePreview();
              }, className: 'hide-preview'},
              null, // Spacer
              {text: 'Dismiss', onclick: function() {
                Instant.popups.windows.del(shareWin);
              }}
            ]
          });
          Instant.popups.menu.addNew({
            text: 'Share video',
            narrowText: 'Video',
            onclick: function() {
              Instant.popups.windows.add(shareWin);
              Instant.popups.hideAll(true);
            }
          });
          var videoTypeForm = $cls('video-type', shareWin);
          var bup = Instant.webrtc.ui.updatePreview.bind(Instant.webrtc.ui);
          Array.prototype.forEach.call($selAll('input', videoTypeForm),
                                       function(el) {
            el.addEventListener('change', bup);
          });
        },
        /* Common code for removing or replacing the video preview */
        _replacePreview: function(newStream) {
          var holder = $cls('video-preview', shareWin);
          if (previewStream != null) {
            Instant.webrtc.closeMedia(previewStream);
          }
          previewStream = newStream;
          while (holder.firstChild) {
            holder.removeChild(holder.firstChild);
          }
          if (newStream != null) {
            var displayNode = Instant.webrtc.displayMedia(newStream);
            holder.appendChild(displayNode);
          }
        },
        /* Update the preview video parameters */
        updatePreview: function() {
          if (! shareWin.classList.contains('has-preview')) {
            Instant.webrtc.ui._replacePreview(null);
            return;
          }
          var form = $cls('video-type', shareWin);
          var type = form.elements['type'].value;
          var audio = (type.indexOf('a') != -1);
          var video = (type.indexOf('v') != -1);
          Instant.webrtc.getUserMedia(audio, video).then(function(stream) {
            // The user could have cancelled the preview in the meantime.
            if (! shareWin.classList.contains('has-preview')) {
              Instant.webrtc.closeMedia(stream);
              return;
            }
            Instant.webrtc.ui._replacePreview(stream);
          }).catch(function(err) {
            Instant.errors.showError(err);
          });
        }
      };
    }(),
    /* Peer-to-peer chat for debugging.
     * Useless, isn't it? */
    chat: function() {
      /* Message ID counter. */
      var msgidCounter = 0;
      /* Mapping from P2P identities to popup nodes. */
      var popups = {};
      return {
        /* Initialize submodule. */
        init: function() {
          Instant.listen('userList.update',
            Instant.webrtc.chat._userListChanged);
          Instant.listen('webrtc.peer.new',
            Instant.webrtc.chat._addPeer);
          Instant.listen('webrtc.peer.remove',
            Instant.webrtc.chat._removePeer);
          Instant.listen('webrtc.conn.close',
            Instant.webrtc.chat._connectionClosed);
          Instant.webrtc.addGlobalControlListener('chat',
            Instant.webrtc.chat._onmessage);
          var menuButton = $makeNode('button', 'button action-p2p-chat',
                                     'P2P Chat');
          menuButton.addEventListener('click', function(evt) {
            var wrapperNode = evt.target.parentNode.parentNode;
            if (! wrapperNode.classList.contains('has-p2p-chat')) return;
            var peerSID = wrapperNode.firstChild.getAttribute('data-id');
            var peerIdent = Instant.webrtc.getPeerIdentity(peerSID);
            if (! peerIdent) return;
            Instant.webrtc.chat.show(peerIdent,
                                     wrapperNode.firstChild.textContent);
            Instant.userList.showMenu(null);
          });
          Instant.userList.addMenuNode($makeFrag(' ', menuButton));
        },
        /* Update the nickname(s) in P2P chat popups. */
        _userListChanged: function(event) {
          var newSID = event.data.added;
          if (! newSID) {
            /* NOP */
          } else if (newSID == Instant.identity.id) {
            var newNick = Instant.identity.nick;
            for (var peer in popups) {
              if (! popups.hasOwnProperty(peer)) continue;
              var nickNode = $sel('.input-nick-cell .nick', popups[peer]);
              Instant.nick.updateNode(nickNode, newNick);
            }
          } else {
            var peer = Instant.webrtc.getPeerIdentity(newSID);
            var popup = popups[peer];
            if (! popup) return;
            var newNick = Instant.userList.get(newSID).textContent;
            popup.setAttribute('data-peer-nick', newNick);
            var nickNode = $sel('.peer-nick .nick', popup);
            Instant.nick.updateNode(nickNode, newNick);
          }
        },
        /* Register a user as potentially having P2P chat support. */
        _addPeer: function(event) {
          var node = Instant.userList.get(event.data.session);
          if (! node) return;
          node.parentNode.classList.add('has-p2p-chat');
        },
        /* Remove a user's potential-chat registration. */
        _removePeer: function(event) {
          var node = Instant.userList.get(event.data.session);
          if (! node) return;
          node.parentNode.classList.remove('has-p2p-chat');
        },
        /* Handle a connection close event. */
        _connectionClosed: function(event) {
          var peer = event.data.connection.peer;
          var popup = popups[peer];
          if (! popup) return;
          Instant.webrtc.chat._showSystemMessage(peer, 'Connection lost.');
          popup.classList.add('disconnected');
          $cls('input-bar', popup).classList.add('offline');
        },
        /* Process an incoming P2P chat message. */
        _onmessage: function(data, conn) {
          var peer = conn.peer;
          var session = Instant.webrtc.getPeerSID(peer);
          var peerNick = null;
          if (session) {
            peerNick = Instant.userList.get(session).textContent;
          }
          if (! popups[peer]) {
            popups[peer] = Instant.webrtc.chat._createPopup(peer, peerNick);
            Instant.webrtc.chat._showSystemMessage(peer,
                                                   '(External connection.)');
          }
          if (! Instant.popups.isShown(popups[peer])) {
            Instant.webrtc._setHighlight(session, true);
          }
          Instant.webrtc.chat._showMessage(peer,
            {nick: popups[peer].getAttribute('data-peer-nick'),
             text: data.data});
        },
        /* Create a P2P chat popup for chatting with the given peer. */
        _createPopup: function(peerIdent, peerNick) {
          var popup = Instant.popups.make({
            title: 'P2P Chat',
            className: 'p2p-chat-popup',
            content: $makeFrag(
              ['div', 'popup-grid-wrapper', [
                ['div', 'popup-grid', [
                  ['b', null, 'With: '],
                  ['span', 'popup-grid-wide peer-nick', [
                    (peerNick) ? Instant.nick.makeNode(peerNick) :
                                 Instant.nick.makeAnonymous()
                  ]]
                ]]
              ]],
              ['hr'],
              ['div', 'message-pane', [
                ['div', 'message-box', [
                  ['div', 'input-bar', [
                    ['div', 'input-info-cell'],
                    ['div', 'input-nick-cell', [
                      Instant.nick.makeNode(Instant.identity.nick)
                    ]],
                    ['div', 'input-message-cell', [
                      ['input', 'input-message', {type: 'text'}]
                    ]]
                  ]]
                ]]
              ]]
            ),
            buttons: [
              {text: 'Hide', onclick: function() {
                Instant.popups.del(popup);
              }},
              {text: 'Disconnect', color: '#c00000', className: 'disconnect',
                  onclick: function() {
                var conn = Instant.webrtc.getConnectionWith(peerIdent);
                if (conn) conn.close();
                Instant.popups.del(popup);
                delete popups[peerIdent];
              }}
            ],
            focusSel: '.input-message'
          });
          popup.setAttribute('data-peer-nick', peerNick);
          var input = $cls('input-message', popup);
          input.addEventListener('keydown', function(event) {
            if (event.keyCode == 13) { // Return.
              if (! input.value || popup.classList.contains('disconnected'))
                return;
              var conn = Instant.webrtc.getConnectionWith(peerIdent);
              if (! conn) {
                Instant.webrtc.chat._showSystemMessage(peerIdent,
                  'Not connected?!', 'Error');
                return;
              }
              conn.sendControlMessage('chat', input.value);
              Instant.webrtc.chat._showMessage(peerIdent, {
                nick: Instant.identity.nick,
                text: input.value
              });
              input.value = '';
            }
          });
          return popup;
        },
        /* Add a message to the P2P chat window for the given peer. */
        _showMessage: function(peerIdent, params) {
          var popup = popups[peerIdent];
          if (! popup) return;
          params.id = 'p2p-' + (++msgidCounter);
          params.timestamp = Date.now();
          var newNode = Instant.message.makeMessage(params);
          var messageBox = $cls('message-box', popup);
          var input = $cls('input-bar', popup);
          messageBox.insertBefore(newNode, input);
        },
        /* Add a system message to the P2P chat window for the given peer. */
        _showSystemMessage: function(peerIdent, text, nick) {
          Instant.webrtc.chat._showMessage(peerIdent, {nick: nick || 'System',
                                                       text: '/me ' + text});
        },
        /* Show the P2P chat with the given session ID, creating it if
         * necessary. */
        show: function(peerIdent, peerNick) {
          if (! popups[peerIdent]) {
            popups[peerIdent] = Instant.webrtc.chat._createPopup(peerIdent,
                                                                 peerNick);
            Instant.webrtc.chat._showSystemMessage(peerIdent,
                                                   'Connecting...');
            Instant.webrtc.connectTo(peerIdent);
          }
          var peerSession = Instant.webrtc.getPeerSID(peerIdent);
          Instant.webrtc._setHighlight(peerSession, false);
          Instant.popups.add(popups[peerIdent]);
        }
      };
    }()
  };
}();
