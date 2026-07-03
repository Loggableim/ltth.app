/**
 * Plugin Enable Script
 * Handles enabling plugins from the disabled plugin page
 */
(function() {
    'use strict';
    
    var btn = document.getElementById('enableBtn');
    var statusMsg = document.getElementById('statusMessage');
    
    if (!btn) return;
    
    var pluginId = btn.getAttribute('data-plugin-id');
    var originalText = btn.textContent.trim();
    var enablingText = btn.getAttribute('data-text-enabling') || '...';
    var successText = btn.getAttribute('data-text-success') || 'Plugin enabled! Redirecting...';
    var errorText = btn.getAttribute('data-text-error') || 'Failed to enable plugin. Please try again.';
    
    btn.addEventListener('click', function() {
        btn.disabled = true;
        btn.textContent = enablingText;
        if (statusMsg) {
            statusMsg.textContent = '';
            statusMsg.style.color = '#94a3b8';
        }
        
        fetch('/api/plugins/' + encodeURIComponent(pluginId) + '/enable', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.success) {
                btn.classList.add('success');
                btn.textContent = '\u2713';
                if (statusMsg) {
                    statusMsg.textContent = successText;
                    statusMsg.style.color = '#10b981';
                }
                
                setTimeout(function() {
                    window.location.reload();
                }, 1500);
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        })
        .catch(function(error) {
            btn.classList.add('error');
            btn.textContent = originalText;
            btn.disabled = false;
            if (statusMsg) {
                statusMsg.textContent = errorText;
                statusMsg.style.color = '#ef4444';
            }
            
            setTimeout(function() {
                btn.classList.remove('error');
            }, 2000);
        });
    });
})();
