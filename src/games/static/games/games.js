
/* Instant game plugin code */

this.InstantGames = function() {
  var GAME_URL_RE = /^game:([a-zA-Z0-9_-]+)\/([0-9a-fA-F,-]+)(?:[?#].*)?$/;

  function Game(embedInfo, name, players) {
    this.embedInfo = embedInfo;
    this.name = name;
    this.players = players;
    this.node = this.embedInfo.node;
  }
  Game.prototype = {
    REQUIRED_PLAYERS: null,
    _onInput: function(text, player) {
      var m = /^([a-zA-Z0-9_-]+)(?:\s+([^]*))?$/.exec(text);
      if (! m) return;
      this.onInput(m[1], m[2] || '');
    },
    onInput: function(command, value, live) {
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

  var InstantGames = {
    games: {},
    register: function(name, data) {
      function RegisteredGame(embedInfo, name, players) {
        Game.call(this, embedInfo, name, players);
        this.init();
      }
      RegisteredGame.prototype = Object.create(Game.prototype);
      for (var prop in data) {
        if (! data.hasOwnProperty(prop)) continue;
        RegisteredGame.prototype[prop] = data[prop];
      }
      InstantGames.games[name] = RegisteredGame;
    }
  };

  Instant.message.embeds.addEmbedder(GAME_URL_RE, function(url) {
    var m = GAME_URL_RE.exec(url);
    var gameName = m[1], players = m[2];
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
      'data-players': players});
  }, {active: 'game', onInit: function(embed) {
    var name = embed.node.getAttribute('data-name');
    if (! name) return;
    var GameClass = InstantGames.games[name];
    embed.game = new GameClass(embed,
      embed.node.getAttribute('data-players').split(','));
    embed.game.renderInitial();
  }, onData: function(embed, info) {
    if (! embed.game) return;
    var update = embed.game._onInput(info.text, info.fromUUID, info.live);
    if (update != null) embed.game.renderUpdate(update);
  }});

  Instant.plugins.mailbox('games.register').handle(function(data) {
    InstantGames.register(data.NAME, data);
  });

  return InstantGames;
}();
