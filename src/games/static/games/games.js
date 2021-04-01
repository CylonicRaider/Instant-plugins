
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

InstantGames.register('popCont', InstantGames.TwoPlayerGame, {
  DISPLAY_NAME: 'Popularity Contest',
  init: function() {
    this.proposalSent = {};
    this.voted = {};
  },
  render: function() {
    InstantGames.TwoPlayerGame.prototype.render.call(this);
    var index = this.getSelfIndex();
    $cls('game-body', this.node).appendChild($makeFrag(
      ['div', 'column', (index == 0) ? [
        ['span', 'header header-0', 'Your proposal:'],
        ['textarea', 'proposal proposal-0'],
        ['button', 'button vote vote-0', 'Vote']
      ] : [
        ['div', 'header header-0', '\u2026proposes:'],
        ['div', 'proposal proposal-0'],
        ['button', 'button vote vote-0', 'Vote']
      ]],
      ['hr'],
      ['div', 'column', (index == 1) ? [
        ['span', 'header header-1', 'Your proposal:'],
        ['textarea', 'proposal proposal-1'],
        ['button', 'button vote vote-1', 'Vote']
      ] : [
        ['div', 'header header-1', '\u2026proposes:'],
        ['div', 'proposal proposal-1'],
        ['button', 'button vote vote-1', 'Vote']
      ]]
    ));
    var myProposal = $sel('textarea.proposal', this.node);
    if (myProposal)
      myProposal.addEventListener('keydown', function(event) {
        if (! this.proposalSent[this.getSelfIndex()] && event.keyCode == 13)
          this.send('proposal', myProposal.value);
      }.bind(this));
    $cls('vote-0', this.node).addEventListener('click',
                                               this.onVote.bind(this, 0));
    $cls('vote-1', this.node).addEventListener('click',
                                               this.onVote.bind(this, 1));
  },
  onInput: function(userID, command, value, live) {
    var index = this.getPlayerIndex(userID);
    switch (command) {
      case 'proposal':
        if (this.proposalSent[index]) break;
        this.proposalSent[index] = true;
        var proposalNode = $cls('proposal-' + index, this.node);
        if (proposalNode.nodeName == 'TEXTAREA') {
          var newProposalNode = $makeNode('div', proposalNode.className);
          proposalNode.parentNode.insertBefore(newProposalNode, proposalNode);
          proposalNode.parentNode.removeChild(proposalNode);
          proposalNode = newProposalNode;
        }
        proposalNode.textContent = value;
        break;
      case 'vote':
        if (this.voted[userID]) break;
        var index = this.getPlayerIndex(value);
        if (index == null) break;
        this.addScore(index, 1);
        this.voted[userID] = true;
        if (userID == Instant.identity.uuid) {
          $cls('vote-0', this.node).disabled = true;
          $cls('vote-1', this.node).disabled = true;
        }
        break;
    }
  },
  onVote: function(index) {
    if (this.voted[Instant.identity.uuid]) return;
    var uuid = this.playerInfo[index].uuid;
    this.send('vote', uuid);
  }
});
