/**
 * Injury Map Module - Consolidated Implementation
 * Handles SVG-based body injury mapping with type selection
 * Single source of truth for injury map functionality
 */

// Global state for injury tracking
let selectedInjuries = [];
let currentInjuryPart = null;

/**
 * Initialize the SVG-based injury map
 * Finds inline SVG with id 'body-map', wires event handlers, and syncs with form data
 * Idempotent: safe to call multiple times
 */
function initializeInjuryMap() {
    // Idempotent: don't re-initialize
    if (initializeInjuryMap._initialized) return;

    const svg = document.getElementById('body-map');
    const selectedList = document.getElementById('selected-injuries-list');
    const hiddenInput = document.getElementById('injuriesData');
    if (!svg) return; // nothing to do

    // Helper: render the selectedInjuries array into the list and hidden input
    function renderSelectedInjuries() {
        if (selectedList) {
            // Create a map of current items for quick diffing
            const existing = Array.from(selectedList.querySelectorAll('li')).reduce((acc, li) => {
                const key = li.getAttribute('data-part');
                if (key) acc[key] = li;
                return acc;
            }, {});

            // Add new items
            selectedInjuries.forEach(part => {
                if (existing[part]) {
                    // already present, keep it
                    delete existing[part];
                    return;
                }
                const li = document.createElement('li');
                li.textContent = part;
                li.setAttribute('data-part', part);
                li.classList.add('adding');
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'remove-injury';
                removeBtn.title = `Remove ${part}`;
                removeBtn.innerHTML = '&times;';
                removeBtn.addEventListener('click', () => {
                    // play removal animation
                    li.classList.add('removing');
                    setTimeout(() => togglePart(part), 160);
                });
                li.appendChild(removeBtn);
                selectedList.appendChild(li);
                // allow CSS transition to run
                requestAnimationFrame(() => {
                    li.classList.remove('adding');
                });
            });

            // Remove items that are no longer present
            Object.keys(existing).forEach(part => {
                const li = existing[part];
                li.classList.add('removing');
                setTimeout(() => li.remove(), 180);
            });
        }
        if (hiddenInput) hiddenInput.value = JSON.stringify(selectedInjuries);
    }

    // Find selectable parts inside the SVG: elements with an id (ellipse, rect, polygon, path)
    const selectable = Array.from(svg.querySelectorAll('ellipse[id], rect[id], polygon[id], path[id], circle[id]'));

    // Toggle by part name (data-name attribute if present, else id)
    function togglePart(partName) {
        const idx = selectedInjuries.indexOf(partName);
        if (idx === -1) {
            selectedInjuries.push(partName);
        } else {
            selectedInjuries.splice(idx, 1);
        }
        // Update classes on SVG elements
        selectable.forEach(el => {
            const name = el.getAttribute('data-name') || el.id;
            if (!name) return;
            if (selectedInjuries.indexOf(name) !== -1) {
                el.classList.add('selected');
                el.setAttribute('aria-pressed', 'true');
            } else {
                el.classList.remove('selected');
                el.setAttribute('aria-pressed', 'false');
            }
        });
        renderSelectedInjuries();
    }

    // Bind handlers for pointer/click/touch and keyboard accessibility
    selectable.forEach(el => {
        const name = el.getAttribute('data-name') || el.id;
        if (!name) return;

        // Make focusable and provide ARIA
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'button');
        el.setAttribute('aria-pressed', selectedInjuries.indexOf(name) !== -1 ? 'true' : 'false');
        el.setAttribute('aria-label', name);

        // Pointer/click handler - open injury type modal
        el.addEventListener('click', (evt) => {
            evt.preventDefault();
            // transient visual tap feedback
            el.classList.add('tapped');
            setTimeout(() => el.classList.remove('tapped'), 160);
            openInjuryModal(name);
        });

        // Touch: use pointer events where supported; click covers most cases, but ensure touch works
        el.addEventListener('pointerdown', (evt) => {
            // Prevent synthetic mouse click double-firing
            evt.preventDefault();
        });

        // Keyboard: Enter/Space opens injury type modal
        el.addEventListener('keydown', (evt) => {
            if (evt.key === 'Enter' || evt.key === ' ') {
                evt.preventDefault();
                openInjuryModal(name);
            }
        });
    });

    // If the form is loaded with existing injuriesData, hydrate selectedInjuries
    try {
        if (hiddenInput && hiddenInput.value) {
            const initial = JSON.parse(hiddenInput.value);
            if (Array.isArray(initial)) {
                selectedInjuries = initial.slice();
            }
        }
    } catch (e) {
        // ignore JSON parse errors
    }

    // Render initial state
    renderSelectedInjuries();

    // Mark initialized
    initializeInjuryMap._initialized = true;
}

/**
 * Open injury type selection modal for a specific body part
 * @param {string} partName - Name of the injured body part
 */
function openInjuryModal(partName) {
    currentInjuryPart = partName;
    const modal = document.getElementById('injury-modal');
    const title = document.getElementById('injury-modal-title');
    
    if (modal && title) {
        title.textContent = `Select Injury Type for ${partName}`;
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modal.style.zIndex = '10000';
        
        // Focus the first injury type button
        const firstBtn = modal.querySelector('.injury-type-options .btn:first-child');
        if (firstBtn) {
            setTimeout(() => firstBtn.focus(), 100);
        }
    }
}

/**
 * Close injury type selection modal
 */
function closeInjuryModal() {
    const modal = document.getElementById('injury-modal');
    if (modal) {
        modal.style.display = 'none';
        currentInjuryPart = null;
    }
}

/**
 * Add injury with type to the selected injuries list
 * @param {string} injuryType - Type of injury selected
 */
function addInjuryWithType(injuryType) {
    if (!currentInjuryPart) return;
    
    // Check if this part already has an injury
    const existingIndex = selectedInjuries.findIndex(injury => {
        return typeof injury === 'object' ? injury.part === currentInjuryPart : injury === currentInjuryPart;
    });
    
    // Remove existing injury for this part if it exists
    if (existingIndex !== -1) {
        selectedInjuries.splice(existingIndex, 1);
    }
    
    // Add new injury with type
    const newInjury = {
        part: currentInjuryPart,
        type: injuryType
    };
    
    selectedInjuries.push(newInjury);
    
    // Update display and close modal
    updateInjuryDisplay();
    closeInjuryModal();
}

/**
 * Update injury display in both SVG and selected injuries list
 * Reflects current state of selectedInjuries in the UI
 */
function updateInjuryDisplay() {
    const svg = document.getElementById('body-map');
    const selectedList = document.getElementById('selected-injuries-list');
    const hiddenInput = document.getElementById('injuriesData');
    
    // Update SVG classes
    if (svg) {
        const selectable = Array.from(svg.querySelectorAll('ellipse[id], rect[id], polygon[id], path[id], circle[id]'));
        selectable.forEach(el => {
            const name = el.getAttribute('data-name') || el.id;
            if (!name) return;
            
            const hasInjury = selectedInjuries.some(injury => {
                return typeof injury === 'object' ? injury.part === name : injury === name;
            });
            
            if (hasInjury) {
                el.classList.add('selected');
                el.setAttribute('aria-pressed', 'true');
            } else {
                el.classList.remove('selected');
                el.setAttribute('aria-pressed', 'false');
            }
        });
    }
    
    // Update selected injuries list
    if (selectedList) {
        selectedList.innerHTML = '';
        selectedInjuries.forEach(injury => {
            const displayText = typeof injury === 'object' ? `${injury.part} - ${injury.type}` : injury;
            const li = document.createElement('li');
            li.textContent = displayText;
            li.setAttribute('data-part', typeof injury === 'object' ? `${injury.part}-${injury.type}` : injury);
            
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'remove-injury';
            removeBtn.title = `Remove ${displayText}`;
            removeBtn.innerHTML = '&times;';
            removeBtn.addEventListener('click', () => {
                li.classList.add('removing');
                setTimeout(() => {
                    const index = selectedInjuries.findIndex(item => {
                        if (typeof item === 'object' && typeof injury === 'object') {
                            return item.part === injury.part && item.type === injury.type;
                        }
                        return item === injury;
                    });
                    
                    if (index !== -1) {
                        selectedInjuries.splice(index, 1);
                        updateInjuryDisplay();
                    }
                }, 160);
            });
            
            li.appendChild(removeBtn);
            selectedList.appendChild(li);
        });
    }
    
    // Update hidden input
    if (hiddenInput) {
        hiddenInput.value = JSON.stringify(selectedInjuries);
    }
}

/**
 * Initialize injury type modal event listeners
 * Wires up modal interactions and injury type selection buttons
 */
function initializeInjuryModal() {
    const modal = document.getElementById('injury-modal');
    const injuryTypeButtons = document.querySelectorAll('.injury-type-options button[data-type]');
    const closeBtn = document.getElementById('closeInjuryModalBtn');
    const cancelBtn = document.getElementById('cancel-injury-selection');
    
    if (!modal) return;
    
    // Close modal when clicking the close button (×)
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeInjuryModal();
        });
    }
    
    // Close modal when clicking the cancel button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeInjuryModal();
        });
    }
    
    // Close modal when clicking outside the content
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeInjuryModal();
        }
    });
    
    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') {
            closeInjuryModal();
        }
    });
    
    // Add click listeners to injury type buttons
    injuryTypeButtons.forEach(button => {
        const injuryType = button.getAttribute('data-type');
        if (injuryType) {
            button.addEventListener('click', () => {
                addInjuryWithType(injuryType);
            });
        }
    });
}

/**
 * Clear all injury selections
 * Resets the selectedInjuries array and updates all displays
 */
function clearAllInjuries() {
    selectedInjuries.length = 0; // Clear array in-place
    updateInjuryDisplay();
}

/**
 * Set injury selections from an array
 * Replaces current injuries with the provided array and updates displays
 * @param {Array} injuries - Array of injury objects with part and type
 */
function setInjuries(injuries) {
    if (!Array.isArray(injuries)) {
        window.Logger.warn('setInjuries: Invalid input, expected array');
        return;
    }
    selectedInjuries.length = 0; // Clear existing
    injuries.forEach(injury => selectedInjuries.push(injury)); // Add new
    updateInjuryDisplay();
    window.Logger.debug('setInjuries: Set', selectedInjuries.length, 'injuries');
}

// Export for external use
window.initializeInjuryMap = initializeInjuryMap;
window.openInjuryModal = openInjuryModal;
window.closeInjuryModal = closeInjuryModal;
window.addInjuryWithType = addInjuryWithType;
window.updateInjuryDisplay = updateInjuryDisplay;
window.initializeInjuryModal = initializeInjuryModal;
window.clearAllInjuries = clearAllInjuries;
window.setInjuries = setInjuries;

// Make global state accessible
window.selectedInjuries = selectedInjuries;
window.currentInjuryPart = currentInjuryPart;

// Auto-initialize injury map when DOM is ready
// This ensures the injury map is initialized before other scripts reference these functions
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('body-map') || document.getElementById('injuryMap')) {
        initializeInjuryMap();
        // Also initialize the injury modal if it exists
        if (document.getElementById('injury-modal')) {
            initializeInjuryModal();
        }
    }
});
