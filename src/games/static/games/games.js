
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
      return {uuid: uuid, name: this.params['p' + index + 'n'], score: 0};
    }.bind(this));
    this.selfIndex = this.getPlayerIndex(Instant.identity.uuid);
    this.turn = null;
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
    render: function() {
      /* should be overridden */
    },
    resetUI: function() {
      /* should be overriden */
    },
    setTurn: function(playerIndex, live) {
      /* overridden by TwoPlayerGame */
      this.turn = playerIndex;
      if (playerIndex == this.selfIndex && live)
        this.embedInfo.raiseAttention('Your turn');
    },
    addScore: function(playerIndex, points) {
      /* overridden by TwoPlayerGame */
      this.playerInfo[playerIndex].score += points;
    },
    registerWin: function(playerIndex, addPoints) {
      if (playerIndex != null && addPoints)
        this.addScore(playerIndex, addPoints);
      this.setTurn(null);
    },
    _onInput: function(userID, text, info) {
      var m = /^([a-zA-Z0-9_-]+)(?:\s+([^]*))?$/.exec(text);
      if (! m) return;
      this.onInput(userID, m[1], (m[2] || '').trim(), info);
    },
    onInput: function(userID, command, value, info) {
      /* should be overridden */
    },
    send: function(command, value) {
      if (value == null) value = '';
      this.embedInfo.send(command + ((value) ? ' ' : '') + value);
    }
  };

  function TwoPlayerGame(embedInfo, name, players, params) {
    Game.call(this, embedInfo, name, players, params);
  }
  TwoPlayerGame.prototype = Object.create(Game.prototype);
  TwoPlayerGame.prototype.REQUIRED_PLAYERS = 2;
  TwoPlayerGame.prototype.HAS_TURNS = false;
  TwoPlayerGame.prototype.setTurn = function(playerIndex, live) {
    Game.prototype.setTurn.call(this, playerIndex, live);
    if (playerIndex == null) {
      this.node.removeAttribute('data-turn');
    } else {
      this.node.setAttribute('data-turn', playerIndex);
    }
  };
  TwoPlayerGame.prototype.render = function() {
    function makeNickNode(pi) {
      return (pi.name == null) ? Instant.nick.makeAnonymous() :
        Instant.nick.makeNode(pi.name);
    }
    indicators = (this.HAS_TURNS) ? this.renderTurnIndicators() :
                                    [null, null];
    this.node.appendChild($makeFrag(
      ['div', 'game-header', [
        ['span', 'player-header player-header-0', [
          makeNickNode(this.playerInfo[0]),
          indicators[0],
          ['span', 'separator', ' '],
          ['span', 'score score-0', '0']
        ]],
        ['span', 'score', ' : '],
        ['span', 'player-header player-header-1', [
          ['span', 'score score-1', '0'],
          ['span', 'separator', ' '],
          indicators[1],
          makeNickNode(this.playerInfo[1])
        ]]
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
  TwoPlayerGame.prototype.resetUI = function() {
    Game.prototype.resetUI.call(this);
    this.node.removeAttribute("data-won");
  };
  TwoPlayerGame.prototype.renderTurnIndicators = function() {
    return [$makeNode('span', 'turn-indicator turn-indicator-0'),
            $makeNode('span', 'turn-indicator turn-indicator-1')];
  };
  TwoPlayerGame.prototype.addScore = function(playerIndex, points) {
    Game.prototype.addScore.call(this, playerIndex, points);
    $sel('.game-header .score-' + playerIndex, this.node).textContent =
      this.playerInfo[playerIndex].score;
  };
  TwoPlayerGame.prototype.registerWin = function(playerIndex, addPoints) {
    Game.prototype.registerWin.call(this, playerIndex, addPoints);
    if (playerIndex != null) {
      this.node.setAttribute("data-won", playerIndex);
    } else {
      this.node.removeAttribute("data-won");
    }
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
    var gameProto = InstantGames.games[gameName].prototype;
    var needPlayers = gameProto.REQUIRED_PLAYERS;
    if (needPlayers != null && splitPlayers.length != needPlayers)
      return $makeNode('span', 'game-error',
                       'Exactly ' + needPlayers + ' required');
    var className = 'game-root game-root-' + gameName;
    if (gameProto.CSS_CLASS) className += ' ' + gameProto.CSS_CLASS;
    return $makeNode('div', className,
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
    embed.game._onInput(info.fromUUID, info.text, info);
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
    $cls('game-body', this.node).appendChild($makeFrag(
      ['div', 'column', (this.selfIndex == 0) ? [
        ['span', 'header header-0', 'Your proposal:'],
        ['textarea', 'proposal proposal-0'],
        ['div', 'button-row', [
          ['button', 'button submit', 'Submit'],
          ' ',
          ['button', 'button vote vote-0', 'Vote']
        ]]
      ] : [
        ['div', 'header header-0', '\u2026proposes:'],
        ['div', 'proposal proposal-0'],
        ['button', 'button vote vote-0', 'Vote']
      ]],
      ['hr'],
      ['div', 'column', (this.selfIndex == 1) ? [
        ['span', 'header header-1', 'Your proposal:'],
        ['textarea', 'proposal proposal-1'],
        ['div', 'button-row', [
          ['button', 'button submit', 'Submit'],
          ' ',
          ['button', 'button vote vote-1', 'Vote']
        ]]
      ] : [
        ['div', 'header header-1', '\u2026proposes:'],
        ['div', 'proposal proposal-1'],
        ['button', 'button vote vote-1', 'Vote']
      ]]
    ));
    var myProposal = $sel('textarea.proposal', this.node);
    if (myProposal) {
      myProposal.addEventListener('keydown', function(event) {
        if (! this.proposalSent[this.selfIndex] && event.keyCode == 13 &&
            ! event.shiftKey)
          this.send('proposal', myProposal.value);
      }.bind(this));
      $cls('submit', this.node).addEventListener('click', function(e) {
        if (! this.proposalSent[this.selfIndex])
          this.send('proposal', myProposal.value);
      }.bind(this));
    }
    $cls('vote-0', this.node).addEventListener('click',
                                               this.onVote.bind(this, 0));
    $cls('vote-1', this.node).addEventListener('click',
                                               this.onVote.bind(this, 1));
  },
  onInput: function(userID, command, value, info) {
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
          var proposalButton = $cls('submit', this.node);
          if (proposalButton) {
            proposalButton.disabled = true;
          }
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

InstantGames.register('tictactoe', InstantGames.TwoPlayerGame, {
  DISPLAY_NAME: 'Tic-tac-toe',
  HAS_TURNS: true,
  LINES: [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ],
  init: function() {
    this.cells = [null, null, null,
                  null, null, null,
                  null, null, null];
    this.restarter = null;
  },
  getRole: function(playerIndex) {
    return (playerIndex == 0) ? 'x' : (playerIndex == 1) ? 'o' : '';
  },
  getSelfRole: function() {
    return this.getRole(this.selfIndex);
  },
  render: function() {
    function makeCellContents() {
      if (selfRole) {
        return [['button', 'button button-noborder', [
          crossNode.cloneNode(true),
          noughtNode.cloneNode(true)
        ]]];
      } else {
        return [
          crossNode.cloneNode(true),
          noughtNode.cloneNode(true)
        ];
      }
    }
    var crossNode = $makeNode('img', 'cross',
      {src: '/static/games/cross.svg', alt: 'x'});
    var noughtNode = $makeNode('img', 'nought',
      {src: '/static/games/nought.svg', alt: 'o'});
    this._crossNode = crossNode;
    this._noughtNode = noughtNode;
    InstantGames.TwoPlayerGame.prototype.render.call(this);
    var selfIndex = this.selfIndex;
    var selfRole = this.getRole(selfIndex);
    var tcls = {x: 'is-crosses', o: 'is-noughts', '': ''}[selfRole];
    $cls('game-body', this.node).appendChild($makeFrag(
      ['div', 'filler'],
      ['table', tcls, [
        ['tr', [
          ['td', 'cell', {'data-cell': '0'}, makeCellContents()],
          ['td', 'cell', {'data-cell': '1'}, makeCellContents()],
          ['td', 'cell', {'data-cell': '2'}, makeCellContents()]
        ]],
        ['tr', [
          ['td', 'cell', {'data-cell': '3'}, makeCellContents()],
          ['td', 'cell', {'data-cell': '4'}, makeCellContents()],
          ['td', 'cell', {'data-cell': '5'}, makeCellContents()]
        ]],
        ['tr', [
          ['td', 'cell', {'data-cell': '6'}, makeCellContents()],
          ['td', 'cell', {'data-cell': '7'}, makeCellContents()],
          ['td', 'cell', {'data-cell': '8'}, makeCellContents()]
        ]]
      ]],
      ['button', 'button another-game', {disabled: 'disabled'},
        ['Another game']],
      ['div', 'filler']
    ));
    $sel('table', this.node).addEventListener('click', function(event) {
      if (selfIndex != this.turn) return;
      var curCellNode = $parentWithClass(event.target, 'cell');
      if (! curCellNode) return;
      var curCell = parseInt(curCellNode.getAttribute('data-cell'));
      if (this.cells[curCell] != null) return;
      this.send('move', selfRole + curCell);
    }.bind(this));
    $cls('another-game', this.node).addEventListener('click', function(e) {
      if (this.restarter == null || selfIndex != this.restarter) return;
      this.send('restart');
    }.bind(this));
    this.setTurn(0);
  },
  renderTurnIndicators: function() {
    var ind0 = this._crossNode.cloneNode(true);
    ind0.classList.add('turn-indicator-0');
    var ind1 = this._noughtNode.cloneNode(true);
    ind1.classList.add('turn-indicator-1');
    return [ind0, ind1];
  },
  onInput: function(userID, command, value, info) {
    var index = this.getPlayerIndex(userID);
    switch (command) {
      case 'move':
        if (index != this.turn) break;
        if (!/^[xo][0-8]$/.test(value)) break;
        if (value[0] != this.getRole(index)) break;
        var cell = parseInt(value[1]);
        if (this.cells[cell] != null) break;
        this.cells[cell] = value[0];
        $sel('[data-cell="' + cell + '"]', this.node)
          .setAttribute('data-filled', value[0]);
        var witness = this.isOver(cell);
        if (witness) {
          this.highlightCells(witness);
          this.registerWin(index, 1);
        } else if (this.isMaybeDraw()) {
          this.registerWin(null);
        } else {
          this.setTurn(1 - this.turn, info.live);
          break;
        }
        this.restarter = 1 - index;
        if (this.selfIndex == this.restarter)
          $cls('another-game', this.node).disabled = false;
        break;
      case 'restart':
        if (this.restarter == null || index != this.restarter) return;
        this.restart(this.restarter, info.live);
        break;
    }
  },
  resetUI: function() {
    InstantGames.TwoPlayerGame.prototype.resetUI.call(this);
    Array.prototype.forEach.call($selAll('.cell', this.node), function(cell) {
      cell.removeAttribute('data-filled');
      cell.classList.remove('highlight');
      cell.classList.remove('no-highlight');
    });
    $cls('another-game', this.node).disabled = true;
  },
  isOver: function(cell) {
    var self = this, expectedValue = this.cells[cell];
    var won = null;
    this.LINES.some(function(line) {
      if (line.indexOf(cell) != -1 && line.every(function(cell) {
        return (self.cells[cell] == expectedValue);
      })) {
        won = line;
        return true;
      }
    });
    return won;
  },
  isMaybeDraw: function() {
    return this.cells.every(function(cell) { return cell != null; });
  },
  highlightCells: function(indices) {
    var highlights = [false, false, false,
                      false, false, false,
                      false, false, false];
    indices.forEach(function(idx) { highlights[idx] = true; });
    Array.prototype.forEach.call($selAll('.cell', this.node),
      function(cell, index) {
        if (highlights[index]) {
          cell.classList.add('highlight');
          cell.classList.remove('no-highlight');
        } else {
          cell.classList.remove('highlight');
          cell.classList.add('no-highlight');
        }
      });
  },
  restart: function(startWith, live) {
    for (var i = 0; i < 9; i++) this.cells[i] = null;
    this.restarter = null;
    this.resetUI();
    this.setTurn(startWith, live);
  }
});
