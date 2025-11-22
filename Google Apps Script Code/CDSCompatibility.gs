/**
 * Compatibility shim for deployed Apps Script revisions.
 * Some deployed revisions or deployment permutations may not expose the expected
 * `CDSService` global. This file provides a safe delegate `CDSService.evaluateCDS`
 * which calls the available evaluation function (`cdsEvaluatePublic` or `cdsEvaluate`).
 */

function _ensureCdsServiceCompatibility() {
  try {
    if (typeof CDSService === 'undefined' || CDSService === null) {
      // Create a minimal CDSService object
      this.CDSService = {};
    }

    // Provide a stable evaluateCDS delegate used by older callers
    if (typeof this.CDSService.evaluateCDS !== 'function') {
      this.CDSService.evaluateCDS = function(input) {
        // Prefer public evaluator if available (no session required)
        if (typeof cdsEvaluatePublic === 'function') {
          try { return cdsEvaluatePublic(input); } catch (e) { throw e; }
        }
        // Fallback to cdsEvaluate if present
        if (typeof cdsEvaluate === 'function') {
          try { return cdsEvaluate(input); } catch (e) { throw e; }
        }
        throw new Error('No CDS evaluator available (cdsEvaluatePublic or cdsEvaluate)');
      };
    }
  } catch (err) {
    // Avoid throwing during load; callers will get an explicit error when calling evaluateCDS
    console.warn('CDSCompatibility: failed to initialize compatibility shim', err);
  }
}

// Initialize on script load
_ensureCdsServiceCompatibility();
