chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('window.html', {
    "state" : "fullscreen",
    'outerBounds': {
      'width': 800,
      'height': 600
    }
  });
});
