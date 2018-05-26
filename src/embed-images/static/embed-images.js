
/* Instant image embedder functionality */

void function() {
  var processorInstalled = false;
  Instant.plugins.mailbox('embed-images').handle(function(data) {
    function finishLoading(event) {
      var img = event.target;
      if (! img.classList.contains('loading')) return;
      var restore = Instant.input.saveScrollState();
      img.classList.remove('loading');
      restore();
    }
    data.forEach(function(elem) {
      var re = new RegExp(elem[0]), srcSubs = elem[1], urlSubs = elem[2];
      if (urlSubs == null) urlSubs = srcSubs;
      Instant.message.parser.addEmbedder(re, function(url) {
        return $makeNode('a', 'embed-image', {href: url.replace(re, urlSubs),
            target: '_blank'}, [
          ['img', 'embed-image', {src: url.replace(re, srcSubs)}]
        ]);
      }, {normalize: true});
    });
    if (data.length && ! processorInstalled) {
      processorInstalled = true;
      Instant.message.parser.addProcessor(function(node) {
        if (! node.classList.contains('in-chat')) return;
        var images = $selAll('img.embed-image:not(.loading)', node);
        Array.prototype.forEach.call(images, function(img) {
          img.classList.add('loading');
          img.addEventListener('load', finishLoading);
          img.addEventListener('error', finishLoading);
        });
      });
    }
  });
}();
