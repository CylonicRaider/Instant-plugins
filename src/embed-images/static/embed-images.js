
/* Instant image embedder functionality */

Instant.plugins.mailbox('embed-images').handle(function(data) {
  function finishLoading(event) {
    var img = event.target;
    if (! img.classList.contains('loading')) return;
    var restore = Instant.input.saveScrollState();
    img.classList.remove('loading');
    restore();
  }
  function checkSize(img) {
    if (! img.classList.contains('loading')) return;
    if (img.naturalHeight != 0) {
      finishLoading({target: img});
    } else {
      setTimeout(checkSize, 100, img);
    }
  }
  data.forEach(function(elem) {
    var re = new RegExp(elem[0]), subs = elem[1];
    Instant.message.parser.addEmbedder(re, function(url) {
      return $makeNode('a', 'embed-image', {href: url, target: '_blank'}, [
        ['img', 'embed-image', {src: url.replace(re, subs)}]
      ]);
    }, {normalize: true});
  });
  if (data.length)
    Instant.message.parser.addProcessor(function(node) {
      if (! node.classList.contains('in-chat')) return;
      var images = $selAll('img.embed-image:not(.loading)', node);
      Array.prototype.forEach.call(images, function(img) {
        img.classList.add('loading');
        img.addEventListener('load', finishLoading);
        img.addEventListener('error', finishLoading);
        checkSize(img);
      });
    });
});
