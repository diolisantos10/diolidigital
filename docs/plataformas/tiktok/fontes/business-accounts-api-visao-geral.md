---
titulo: "Accounts API (Organic API) — Overview: publicar e gerenciar posts orgânicos de conta de negócio pelo portal de business"
url: https://business-api.tiktok.com/portal/docs/accounts-api-overview/v1.3
capturado_em: 2026-10-30
hash: b1705ac287cd351d
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

Starting January 1, 2027, /campaign/create/ , /campaign/copy/task/create/, /adgroup/create/, /ad/create/, and /ad/aco/create/ will no longer support creating or copying non-Search Legacy Manual Flow campaigns, or creating ad groups or ads under them, for Sales, App Promotion, and Lead Generation objectives. Please migrate affected workflows to the Upgraded Smart+ APIs as soon as possible.
About the Guide
Overview
What's New
Get Started
TikTok for Business MCP Server
Skill and MCP management
FAQs
Use Cases
Marketing API
Organic API
Overview
Accounts API
Overview
Guides
API reference
Mentions API
TikTok One API
Discovery API
Spark Ads Recommendation API
Business Messaging API
API Reference
API Playground
API Service Status Page
Appendix
SDK
Benefits of Accounts API
Accounts API Use Cases
Terms
Overview

TikTok's Accounts API is a series of three interface services provided by the API for Business team to developers. Through integrating and calling the Accounts API, developers can leverage our interface to interact with TikTok accounts, including pulling Reporting / Insights, Comment Moderation, and Video Publishing.

Note
To ensure proper use of the Accounts API, starting March 20, 2026 at 00:00 (GMT+0), developers must complete the Accounts API Access Application Form before submitting a new developer app or requesting a scope increase that includes the "TikTok Accounts" permission scope. Please follow the instructions carefully and provide clear, accurate information to help facilitate the application review process. For more details on Accounts API use cases, please refer to the Accounts API documentation.

Accounts Insights: Enables advertisers with owned TikTok accounts on TikTok to gain access to detailed analytics and insights around their follower base and video engagements.
Accounts Moderation: Enables advertisers to moderate comments on their TikTok accounts.
Accounts Video Publishing: Enables advertisers to publish videos to their TikTok accounts.
Benefits of Accounts API
Gaining programmatic and scaled control: TikTok's Accounts API enables advertisers to gain programmatic, scaled control over Accounts Insights, Moderation, and Publishing.
Providing deep insights: TikTok's Accounts API enables businesses that have an account on TikTok to get detailed analytics and insights into their follower base and profile engagement, as well as reach and engagement data for their organic posts.
Enabling third party partners to leverage data: TikTok's Accounts API enables advertisers' third party partners to leverage the data for cross-platform monitoring and reporting and giving them publishing capabilities within their own platforms.
Accounts API Use Cases

Please use the Accounts API only in accordance with permitted usage as indicated below. TikTok reserves the right to revoke a developer's Accounts API access at any time without prior notice in the event of unintended use, policy violations, or misuse or abuse of the Accounts API.

Authorized Uses of Accounts API:

Manage the organic presence of brands or creators' owned accounts on TikTok, including:

Publishing video or photo posts.
Moderating comments.
Analyzing TikTok profile and post insights.
Performing ad authorization for TikTok posts.

Prohibited Uses of Accounts API:

Extract reports of TikTok profiles and posts from authorized creators' accounts, and use the aggregated data to develop a self-built affiliate influencer marketing program (such as creator discovery and ranking), instead of using the TikTok One platform or API.
Download TikTok videos and images, promote third-party solutions to save user data or media from TikTok, or migrate content to another TikTok account or other social media platforms.
Terms
TikTok account: A unified digital profile on the TikTok platform that enables individuals, creators, and brands to create multimedia content, engage with global communities, and conduct social commerce.
General TikTok Account (also called Personal Account): This is the standard account everyone begins with. It offers the native TikTok features for content creation, engagement, but does not include entries to Web Business Suite or Mobile Business Suite.
TikTok Account with Advanced Access: This intermediate level is granted when you link your TikTok account to a TikTok for Business account or an unverified Business Center. It unlocks additional organic tools and insights for content management and performance analysis.
Verified Business Account (formerly known as Registered Business Account): The highest level, granted after successful business verification. It unlocks enhanced business tools, stronger brand presence, and more advanced conversion capabilities, transforming the account into a full-featured business tool.
Business: A business utilizing a TikTok account to organically promote their products and services and engage with audiences on TikTok.
Developer: Entity developing applications that utilize the Accounts API for TikTok accounts. This may be an independent entity that develops software for use by a business operating an account on TikTok or a business themselves.
Was the information helpful?
Yes
No