
/* Instant game plugin code */

this.InstantGames = function() {
  var GAME_URI_RE =
    /^game:([a-zA-Z0-9_-]+)\/([0-9a-fA-F,-]+)(?:\?([^#]*))?$/;

  function Game(embedInfo, name, players, params) {
    this.embedInfo = embedInfo;
    this.name = name;
    this.players = players;
    this.params = params;
    this.node = this.embedInfo.node;
    this.playerInfo = this.players.map(function(uuid, index) {
      return {uuid: uuid, name: this.params['p' + index + 'n']};
    }.bind(this));
  }
  Game.prototype = {
    DISPLAY_NAME: null,
    REQUIRED_PLAYERS: null,
    init: function() {
      /* should be overridden */
    },
    getPlayerIndex: function(uuid) {
      var idx = this.players.indexOf(uuid);
      if (idx == -1) idx = null;
      return idx;
    },
    getSelfIndex: function() {
      return this.getPlayerIndex(Instant.identity.uuid);
    },
    render: function() {
      /* should be overridden */
    },
    setTurn: function(playerIndex) {
      /* overridden by TwoPlayerGame; may be overridden by others */
    },
    _onInput: function(userID, text, live) {
      var m = /^([a-zA-Z0-9_-]+)(?:\s+([^]*))?$/.exec(text);
      if (! m) return;
      this.onInput(userID, m[1], (m[2] || '').trim(), live);
    },
    onInput: function(userID, command, value, live) {
      /* should be overridden */
    },
    send: function(command, value) {
      if (value == null) value = '';
      this.embedInfo.send(command + ((value) ? ' ' : '') + value);
    }
  };

  function TwoPlayerGame(embedInfo, name, players, params) {
    Game.call(this, embedInfo, name, players, params);
    this.playerInfo.forEach(function(item) {
      item.score = 0;
    });
  }
  TwoPlayerGame.prototype = Object.create(Game.prototype);
  TwoPlayerGame.prototype.REQUIRED_PLAYERS = 2;
  TwoPlayerGame.prototype.setTurn = function(playerIndex) {
    var header = $cls('game-header', this.node);
    if (playerIndex == null) {
      header.removeAttribute('data-turn');
    } else {
      header.setAttribute('data-turn', playerIndex);
    }
  };
  TwoPlayerGame.prototype.render = function() {
    function makeNickNode(pi) {
      return (pi.name == null) ? Instant.nick.makeAnonymous() :
        Instant.nick.makeNode(pi.name);
    }
    this.node.appendChild($makeFrag(
      ['div', 'game-header', [
        makeNickNode(this.playerInfo[0]),
        ['span', 'separator', ' '],
        ['span', 'score score-0', '0'],
        ['span', 'separator', ' '],
        ['span', 'score', ':'],
        ['span', 'separator', ' '],
        ['span', 'score score-1', '0'],
        ['span', 'separator', ' '],
        makeNickNode(this.playerInfo[1])
      ]],
      ['div', 'game-body']
    ));
    var nicks = $clsAll('nick', this.node);
    nicks[0].classList.add('name-0');
    nicks[1].classList.add('name-1');
    this.node.addEventListener('click', function(event) {
      event.stopPropagation();
    });
  };
  TwoPlayerGame.prototype.addScore = function(index, points) {
    this.playerInfo[index].score += points;
    $sel('.game-header .score-' + index, this.node).textContent =
      this.playerInfo[index].score;
  };

  var InstantGames = {
    Game: Game,
    TwoPlayerGame: TwoPlayerGame,
    games: {},
    register: function(name, superConstructor, data) {
      function RegisteredGame(embedInfo, name, players, params) {
        superConstructor.call(this, embedInfo, name, players, params);
        this.init();
      }
      RegisteredGame.prototype = Object.create(superConstructor.prototype);
      for (var prop in data) {
        if (! data.hasOwnProperty(prop)) continue;
        RegisteredGame.prototype[prop] = data[prop];
      }
      InstantGames.games[name] = RegisteredGame;
    }
  };

  Instant.message.embeds.addEmbedder(GAME_URI_RE, function(url) {
    var m = GAME_URI_RE.exec(url);
    var gameName = m[1], players = m[2], params = m[3] || '';
    var splitPlayers = players.split(',');
    if (! splitPlayers.every(Boolean)) {
      return $makeNode('span', 'game-error', [
        'Invalid ', ['code', 'monospace', 'game:'], ' URI'
      ]);
    }
    if (! InstantGames.games.hasOwnProperty(gameName))
      return $makeNode('span', 'game-error', [
        'Unknown game ', ['code', 'monospace', [$text(gameName)]]
      ]);
    var needPlayers = InstantGames.games[gameName].prototype.REQUIRED_PLAYERS;
    if (needPlayers != null && splitPlayers.length != needPlayers)
      return $makeNode('span', 'game-error',
                       'Exactly ' + needPlayers + ' required');
    return $makeNode('div', 'game-root game-root-' + gameName,
                     {'data-name': gameName, 'data-players': players,
                      'data-params': params});
  }, {active: 'game', onInit: function(embed) {
    var name = embed.node.getAttribute('data-name');
    if (! name) return;
    var GameClass = InstantGames.games[name];
    embed.game = new GameClass(embed, name,
      embed.node.getAttribute('data-players').split(',')
        .map(decodeURIComponent),
      $query(embed.node.getAttribute('data-params')));
    embed.game.render();
  }, onData: function(embed, info) {
    if (! embed.game) return;
    embed.game._onInput(info.fromUUID, info.text, info.live);
  }});

  Instant.plugins.mailbox('games.register').handle(function(data) {
    var superConstructor = data.EXTENDS;
    if (superConstructor == null) {
      superConstructor = Game;
    } else if (typeof superConstructor == 'string') {
      superConstructor = InstantGames[superConstructor];
    }
    InstantGames.register(data.NAME, superConstructor, data);
  });

  return InstantGames;
}();
