
/* Instant meme plugin functionality */

void function() {
  function makeQuery(values) {
    var ret = '';
    for (var k in values) {
      if (! values.hasOwnProperty(k) || ! values[k]) continue;
      ret += (ret) ? '&' : '?';
      ret += encodeURIComponent(k) + '=' + encodeURIComponent(values[k]);
    }
    return ret;
  }
  /* Install image handler */
  Instant.plugins.mailbox('embed-images').post([[
    '^meme:instant/([a-zA-Z0-9_-]+(/[a-zA-Z0-9_-]+)?\\.[a-z]+(\\?.*)?)$',
    '/meme/$1'
  ]]);
  var installed = false;
  Instant.plugins.mailbox('memes').handle(function(data) {
    function updateBottomImage() {
      bottomImage.disabled = ! enableBottomImage.checked;
    }
    function makeMemeURL(mode) {
      var url = 'meme:instant/' + topImage.value;
      if (enableBottomImage.checked) url += '/' + bottomImage.value;
      url += '.jpg' + makeQuery({top: topText.value,
                                 bottom: bottomText.value});
      if (mode == 'real') {
        return url.replace(/^meme:instant/, '/meme');
      } else if (mode == 'embed') {
        return '<!' + url + '>';
      } else {
        return url;
      }
    }
    if (installed || ! data.length) return;
    installed = true;
    /* Sort data for user display */
    var defaultItem = data[0][0];
    data.sort(function(a, b) {
      var keyA = a[1], keyB = b[1];
      return (keyA > keyB) - (keyA < keyB);
    });
    /* Create popup */
    var popup = Instant.popups.make({
      title: 'Meme generator',
      content: $makeFrag(['table', 'meme-creator', [
        ['tr', [
          ['td'],
          ['td', ['Image: ']],
          ['td', 'wide-column', [['select', 'top-image']]]
        ]],
        ['tr', [
          ['td'],
          ['td', 'no-wrap', ['Top text: ']],
          ['td', [['input', 'top-text', {type: 'text'}]]]
        ]],
        ['tr', [
          ['td', [['input', {id: 'enable-bottom-image', type: 'checkbox'}]]],
          ['td', 'no-wrap', [
            ['label', {for: 'enable-bottom-image'}, 'Bottom image: ']
          ]],
          ['td', [['select', 'bottom-image']]]
        ]],
        ['tr', [
          ['td'],
          ['td', 'no-wrap', ['Bottom text: ']],
          ['td', [['input', 'bottom-text', {type: 'text'}]]]
        ]]
      ]],
      ['div', 'meme-preview']),
      buttons: [{
        text: 'Preview',
        onclick: function() {
          var url = makeMemeURL('real');
          var link = $makeNode('a', {target: '_blank', href: url}, [
            ['img']
          ]);
          var img = $sel('img', link);
          img.addEventListener('load', function() {
            while (previewContainer.firstChild)
              previewContainer.removeChild(previewContainer.firstChild);
            previewContainer.appendChild(link);
          });
          img.addEventListener('error', function() {
            Instant.popups.addNewMessage(popup, {content: $makeFrag(
              ['b', null, 'Error: '],
              'Could not load image?!'
            ), className: 'popup-message-error'});
          });
          img.src = makeMemeURL('real');
        }
      },
      null,
      {
        text: 'Post!',
        color: '#008000',
        onclick: function() {
          Instant.input.insertText(makeMemeURL('embed'));
          Instant.input.post();
          Instant.popups.del(popup);
        }
      }, {
        text: 'Write text',
        color: '#008000',
        onclick: function() {
          Instant.input.insertText(makeMemeURL('embed'));
          Instant.popups.del(popup);
        }
      }, {
        text: 'Cancel',
        onclick: function() {
          Instant.popups.del(popup);
        }
      }],
      focusSel: '.top-image'
    });
    /* Set up variables for helper functions */
    var topImage = $cls('top-image', popup);
    var bottomImage = $cls('bottom-image', popup);
    var topText = $cls('top-text', popup);
    var bottomText = $cls('bottom-text', popup);
    var enableBottomImage = $sel('#enable-bottom-image', popup);
    enableBottomImage.addEventListener('click', updateBottomImage);
    updateBottomImage();
    var previewContainer = $cls('meme-preview', popup);
    /* Add menu entries */
    for (var i = 0; i < data.length; i++) {
      var attrs = {value: data[i][0]};
      if (attrs.value == defaultItem) attrs.selected = 'selected';
      topImage.appendChild($makeNode('option', attrs, data[i][1]));
      bottomImage.appendChild($makeNode('option', attrs, data[i][1]));
    }
    /* Add entry point */
    Instant.sidebar.extras.addNewButton({
      text: $makeNode('span', 'memes-special', 'Make meme'),
      onclick: function() {
        Instant.sidebar.extras.hide();
        Instant.popups.add(popup);
      }
    });
  });
}();
