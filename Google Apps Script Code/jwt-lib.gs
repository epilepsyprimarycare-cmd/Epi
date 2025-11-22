/**
 * A simple library for creating the JSON Web Token (JWT) needed for VAPID web push authentication.
 */
function VapidTokenGenerator(privateKey) {
  const ALGORITHM = 'ES256';
  const SIGNATURE_ALGORITHM = 'SHA256withECDSA';
  
  // Helper to URL-safe Base64 encode
  function base64UrlEncode(str) {
    return Utilities.base64EncodeWebSafe(str).replace(/=+$/, '');
  }

  // Creates the JWT
  this.generate = function(audience) {
    const header = {
      'typ': 'JWT',
      'alg': ALGORITHM
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      'aud': audience,
      'exp': now + (12 * 60 * 60), // Token is valid for 12 hours
      'sub': 'mailto:your-email@example.com' // Replace with your email
    };

    const headerB64 = base64UrlEncode(JSON.stringify(header));
    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const unsignedToken = headerB64 + '.' + payloadB64;

    const privateKeyBytes = Utilities.base64Decode(privateKey);
    const signature = Utilities.computeEcdsaSignature(Utilities.newBlob(unsignedToken).getBytes(), privateKeyBytes);
    
    const signatureB64 = base64UrlEncode(signature);

    return unsignedToken + '.' + signatureB64;
  };
}