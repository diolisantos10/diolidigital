---
titulo: "OAuth — User Access Token Management (validade do access token e do refresh token)"
url: https://developers.tiktok.com/doc/oauth-user-access-token-management
capturado_em: 2026-11-02
hash: b562ff4528d80b9b
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

Last updated November 2, 2026
Manage OAuth Access Tokens

A user access token lets your app call TikTok APIs on behalf of a TikTok user who has authorized your app. Your server gets the token from an authorization code, refreshes it before it expires, and revokes it when the user disconnects your app.

For the endpoints, see Get a User Access Token, Refresh a User Access Token, and Revoke a User Access Token.

Token lifecycle

A user access token moves through the following stages:

Get: After the user authorizes your app, your redirect URI receives an authorization code. Your server exchanges the code for an access token and a refresh token.
Refresh: Before the access token expires, your server uses the refresh token to get a new access token. The user does not need to authorize your app again.
Revoke: When the user disconnects your app, your server revokes the access token.
Token lifetimes

The following table lists how long each token is valid after it is issued:

Token

	

Lifetime

	

Response field

Access token

	

2 hours

	

expires_in

Refresh token

	

180 days

	

refresh_expires_in

Both fields return the remaining lifetime in seconds. Use them to schedule refreshes rather than hard-coding the lifetimes.

Refresh token rotation

A refresh request will return a different refresh_token from the one you sent. Replace your stored refresh token with the returned value every time you refresh.

Caution: If you keep using a refresh token that has been replaced, later refresh requests fail and the user must authorize your app again.

Token storage

Call the token endpoints from your server, not from client-side code. Each request includes your client secret, which must never be exposed to users.

Store the following values on your server for each user:

access_token
refresh_token
open_id
scope
The expiry times calculated from expires_in and refresh_expires_in
Next steps
Get a User Access Token
Refresh a User Access Token
Revoke a User Access Token
OAuth Error Handling
On this page
Token lifecycle
Token lifetimes
Refresh token rotation
Token storage
Next steps