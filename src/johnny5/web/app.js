// Johnny5 Web Viewer JavaScript

document.addEventListener('DOMContentLoaded', async function() {
    console.log('Johnny5 Web Viewer loaded');
    
    // Load PDF info from API
    try {
        const response = await fetch('/api/pdf-info');
        const pdfInfo = await response.json();
        
        console.log('PDF Info:', pdfInfo);
        
        // Update UI with PDF info
        const pdfInfoElement = document.querySelector('.pdf-info p');
        if (pdfInfoElement) {
            pdfInfoElement.innerHTML = `<strong>PDF:</strong> ${pdfInfo.pdf_path}`;
        }
        
        // TODO: Initialize PDF.js viewer
        // TODO: Load document structure
        // TODO: Set up interactive features
        
    } catch (error) {
        console.error('Failed to load PDF info:', error);
    }
});

// TODO: Implement PDF.js integration
// TODO: Implement document structure loading
// TODO: Implement interactive features
