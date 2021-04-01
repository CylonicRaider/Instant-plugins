
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
    REQUIRED_PLAYERS: null,
    _onInput: function(text, playerID, live) {
      var m = /^([a-zA-Z0-9_-]+)(?:\s+([^]*))?$/.exec(text);
      if (! m) return;
      var idx = this.players.indexOf(playerID);
      if (idx == -1) idx = null;
      this.onInput(idx, m[1], m[2] || '', live);
    },
    onInput: function(playerIndex, command, value, live) {
      /* should be overridden */
      return null;
    },
    send: function(command, value) {
      this.embedInfo.send(command + ((value) ? ' ' : '') + value);
    },
    init: function() {
      /* should be overridden */
    },
    renderInitial: function() {
      /* should be overridden */
    },
    renderUpdate: function(update) {
      /* should be overridden */
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
  TwoPlayerGame.prototype.renderInitial = function() {
    function makeNickNode(pi) {
      return (pi.name == null) ? Instant.nick.makeAnonymous() :
        Instant.nick.makeNode(pi.name);
    }
    this.node.appendChild($makeNode('div', 'game-header', [
      makeNickNode(this.playerInfo[0]),
      ['span', 'separator', ' '],
      ['span', 'score score-0', '0'],
      ['span', 'separator', ' '],
      ['span', 'score', ':'],
      ['span', 'separator', ' '],
      ['span', 'score score-1', '0'],
      ['span', 'separator', ' '],
      makeNickNode(this.playerInfo[1])
    ]));
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
    return $makeNode('div', 'game-content', {'data-name': gameName,
      'data-players': players, 'data-params': params});
  }, {active: 'game', onInit: function(embed) {
    var name = embed.node.getAttribute('data-name');
    if (! name) return;
    var GameClass = InstantGames.games[name];
    embed.game = new GameClass(embed, name,
      embed.node.getAttribute('data-players').split(',')
        .map(decodeURIComponent),
      $query(embed.node.getAttribute('data-params')));
    embed.game.renderInitial();
  }, onData: function(embed, info) {
    if (! embed.game) return;
    var update = embed.game._onInput(info.text, info.fromUUID, info.live);
    if (update != null) embed.game.renderUpdate(update);
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
