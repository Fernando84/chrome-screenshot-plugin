// Listen for keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'take-screenshot') {
    captureFullPage();
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureFullPage') {
    captureFullPage(sendResponse);
    return true; // Keep the message channel open
  }
});

// Create a queue to manage screenshot tasks
class ScreenshotQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.lastCaptureTime = 0;
    this.minDelay = 500; // Minimum delay time (milliseconds)
  }

  async add(windowId) {
    return new Promise((resolve, reject) => {
      this.queue.push({ windowId, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    const task = this.queue.shift();
    
    try {
      const now = Date.now();
      const timeSinceLastCapture = now - this.lastCaptureTime;
      
      if (timeSinceLastCapture < this.minDelay) {
        await new Promise(resolve => setTimeout(resolve, this.minDelay - timeSinceLastCapture));
      }
      
      const dataUrl = await chrome.tabs.captureVisibleTab(task.windowId, {
        format: 'png'
      });
      
      this.lastCaptureTime = Date.now();
      task.resolve(dataUrl);
    } catch (error) {
      task.reject(error);
    } finally {
      this.processing = false;
      this.process(); // Process the next task in the queue
    }
  }
}

const screenshotQueue = new ScreenshotQueue();

async function captureFullPage(sendResponse) {
  try {
    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if the URL can be captured
    if (!tab || !tab.url || !isValidUrl(tab.url)) {
      throw new Error('The current page cannot be captured. Please use this feature on regular web pages (such as http or https sites).');
    }

    try {
      // Try to inject content script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          return true;
        }
      });
    } catch (error) {
      throw new Error('Unable to execute screenshot on the current page. Please use this feature on regular web pages.');
    }

    // Get page dimensions
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        return {
          scrollHeight: Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight,
            document.documentElement.offsetHeight
          ),
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth
        };
      }
    });

    const { scrollHeight, viewportHeight } = result;
    
    // Calculate the number of scrolls needed
    const scrollCount = Math.ceil(scrollHeight / viewportHeight);
    let fullPageCanvas = null;
    let firstImageWidth = 0;
    
    try {
      // Send message to content script, prepare for screenshot
      await chrome.tabs.sendMessage(tab.id, { action: 'prepareForScreenshot' });
    } catch (error) {
      console.warn('Content script not ready, proceeding without preparation');
    }
    
    for (let i = 0; i < scrollCount; i++) {
      // Scroll to the specified position
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: (i, viewportHeight) => {
          window.scrollTo(0, i * viewportHeight);
        },
        args: [i, viewportHeight]
      });
      
      // Wait for scroll to complete and redraw
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Use queue to manage screenshot
      const dataUrl = await screenshotQueue.add(tab.windowId);
      
      // Convert dataUrl to Blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      
      // Create bitmap
      const bitmap = await createImageBitmap(blob);
      
      // First screenshot creates canvas
      if (!fullPageCanvas) {
        firstImageWidth = bitmap.width;
        fullPageCanvas = new OffscreenCanvas(bitmap.width, scrollHeight);
      }
      
      // Draw screenshot to canvas
      const ctx = fullPageCanvas.getContext('2d');
      ctx.drawImage(bitmap, 0, i * viewportHeight);
      
      // Release bitmap resources
      bitmap.close();
    }
    
    // Restore original scroll position
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        window.scrollTo(0, 0);
      }
    });
    
    try {
      // Send message to content script, complete screenshot
      await chrome.tabs.sendMessage(tab.id, { action: 'screenshotComplete' });
    } catch (error) {
      console.warn('Content script not ready, proceeding without cleanup');
    }
    
    // Convert canvas to blob
    const blob = await fullPageCanvas.convertToBlob({
      type: 'image/png'
    });
    
    // Convert to dataUrl
    const finalDataUrl = await blobToDataURL(blob);
    
    if (sendResponse) {
      sendResponse({
        success: true,
        dataUrl: finalDataUrl
      });
    }
  } catch (error) {
    console.error('Screenshot failed:', error);
    if (sendResponse) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }
}

// Convert Blob to DataURL
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Check if URL can be captured
function isValidUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
} 