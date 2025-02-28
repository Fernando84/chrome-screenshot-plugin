// Save original scroll state
let originalScrollPosition = 0;
let originalOverflow = '';

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'prepareForScreenshot') {
    // Save the current scroll position
    originalScrollPosition = window.scrollY;
    // Save and modify overflow style to prevent scrollbars from affecting the screenshot
    originalOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
  } else if (request.action === 'screenshotComplete') {
    // Restore original state
    document.documentElement.style.overflow = originalOverflow;
    window.scrollTo(0, originalScrollPosition);
  }
}); 