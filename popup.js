document.addEventListener('DOMContentLoaded', function() {
  const captureBtn = document.getElementById('captureBtn');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const preview = document.getElementById('preview');
  const shortcutKey = document.getElementById('shortcutKey');

  // Set shortcut key display based on the operating system
  shortcutKey.textContent = navigator.platform.includes('Mac') ? 'Command+Shift+S' : 'Ctrl+Shift+S';

  let currentScreenshot = null;

  captureBtn.addEventListener('click', async () => {
    captureBtn.disabled = true;
    captureBtn.textContent = 'Capturing...';
    
    try {
      // Send message to background script to start capturing
      const response = await chrome.runtime.sendMessage({ action: 'captureFullPage' });
      
      if (response.success) {
        currentScreenshot = response.dataUrl;
        preview.src = currentScreenshot;
        preview.style.display = 'block';
        copyBtn.style.display = 'block';
        downloadBtn.style.display = 'block';
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      alert('Capture failed: ' + error.message);
    } finally {
      captureBtn.disabled = false;
      captureBtn.textContent = 'Capture Full Page';
    }
  });

  copyBtn.addEventListener('click', async () => {
    try {
      const response = await fetch(currentScreenshot);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      alert('Copied to clipboard!');
    } catch (error) {
      alert('Copy failed: ' + error.message);
    }
  });

  downloadBtn.addEventListener('click', () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `screenshot-${timestamp}.png`;
    
    chrome.downloads.download({
      url: currentScreenshot,
      filename: filename,
      saveAs: true
    });
  });
}); 