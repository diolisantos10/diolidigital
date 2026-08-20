---
titulo: "Marketing API — /file/video/ad/upload/ (upload de vídeo de anúncio: formatos, tamanho, hash)"
url: https://business-api.tiktok.com/portal/docs?id=1737587322856449
capturado_em: 2026-08-20
hash: 664e0e0aa90c70dc
---

> Documento oficial capturado da plataforma. A fonte é a URL acima;
> este arquivo é a cópia de trabalho da biblioteca. Não edite à mão.

About the Guide
Overview
What's New
Get Started
TikTok for Business MCP Server
Skill management
FAQs
Use Cases
Marketing API
Organic API
Business Messaging API
API Reference
Accounts
Ads
Ad Accounts
Ad Comments
Ad Comments - Blocked Words
Ad Diagnosis
Ad Groups
Ad Review
Audience
Authentication
Automated Rules
BC Management
BC Payments
BC Payment Portfolios
BC Assets
BC Asset Groups
BC Billing Groups
BC Partners
BC Members
BC Invoices
BC Reporting
Brand Safety
Business Messaging
Campaign
Catalog Management
Catalog Event Sources
Catalog Feeds
Catalog Products
Catalog Product Sets
Catalog Videos
Catalog Video Templates
Catalog Diagnostics
Catalog Insights
Change Log
Creative Portfolios
Creative Reports
Creative Tools
Custom Conversions
Discovery
(Deprecated) Dynamic Scene
Events 2.0
Events 1.0
Files
GMV Max
Identity
Images
Leads
Media Mix Modeling
MCP Authorization
Mentions
Music
Negative Keywords
Page
Pangle
Playable Ads
Reach & Frequency
Reporting
Showcase
Smart Creative
(To be deprecated) Legacy Smart+
Upgraded Smart+
Spark Ads Recommendation
Spark Ads Using Authorized Posts
Super Split Test
Subscription
Terms
TikTok One
TikTok Store
Tools
User
Verification
Video
Upload a video
Update the name of a video
Get info about videos
Search for videos
Get suggested thumbnails for a video
Welcome Messages
API Playground
API Service Status Page
Appendix
SDK
Before you start
Comparing v1.2 and v1.3
Request
Example
Upload by file with Smart Fix enabled
Upload by file with Smart Fix disabled
Upload by URL with Smart Fix enabled
Response
Example
Upload by file with Smart Fix enabled and issue detected
Upload by file with Smart Fix disabled
Upload by URL with Smart Fix enabled and issue detected
Upload a video

Use this endpoint to upload a video to the Asset Library and use the obtained video ID for creating ads.

Request timeout for this interface is 10s, and the transmission speed depends on network bandwidth. Please make sure that the file size is reasonable.

If you upload a video that already exists in the advertiser account, the API response will be the information of the existing video.

Note

We recommend that you turn on Smart Fix when uploading your videos. This API will automatically detect and fix issues in your videos, ensuring that they meet our requirements for delivery. To learn about how to enable Smart Fix, please refer to Smart Fix.
Starting April 24th, 2025, Smart Fix will limit automatic fixes only to the flaw types LOW_RESOLUTION and ILLEGAL_VIDEO_SIZE and function as follows:
Resolution adjustments:
LOW_RESOLUTION: If this issue is detected, the video is automatically enhanced to a standard resolution of 1280x720 pixels, also referred to as 720p.
ILLEGAL_VIDEO_SIZE: If this issue is detected, the video is automatically adjusted to one of the standard aspect ratios: 1:1 (square), 9:16 (vertical), or 16:9 (horizontal).
Output limitation: Only one fixed version of the video will be returned.
Naming conventions: The fixed video will be named either according to the custom name specified via the file_name parameter or following the default naming convention if no custom name is given (see the description of file_name for details).
Before you start

You need to confirm the video meets the Creative requirements for delivery before the video can be used in ads.

Comparing v1.2 and v1.3

The following table outlines the differences between v1.2 and v1.3 endpoints.

Changes	v1.2	v1.3

Endpoint path
	
/v1.2/file/video/ad/upload/
	
/v1.3/file/video/ad/upload/

Request parameter data type
	
advertiser_id: number
	
advertiser_id: string

New request parameter
	
/
	
is_third_party: boolean
flaw_detect: boolean
auto_fix_enabled: boolean
auto_bind_enabled: boolean
video_id: string

Response parameter name
	
poster_url
url
	
video_cover_url
preview_url

Response parameter deprecated in v1.3
	
/
	
id

New response parameter
	
/
	
fix_task_id:string
flaw_types: string[]
preview_url_expire_time: string
Request

Endpoint https://business-api.tiktok.com/open_api/v1.3/file/video/ad/upload/

Method POST

Header

Field	Data Type	Description

Access-Token
Required
	
string
	
Authorized access token. For details, see Authentication.

Content-Type
Required
	
string
	
Request message type.
If upload_type is UPLOAD_BY_FILE, use multipart/form-data .
If upload_type is UPLOAD_BY_URL or UPLOAD_BY_FILE_ID, use application/json.

Parameters

Field	Data Type	Description

advertiser_id
Required
	
string
	
Advertiser ID.

file_name
	
string
	
Video name.

Length limit: 1 - 100 characters.

Default value:
When Smart Fix is not enabled (flaw_detect and auto_fix_enabled are set to false):
If you upload a local file, the default name will be the original file name.
If you provide a URL, the default name will be the filename portion of the URL path.
If the original file name or the filename portion of the URL path exceeds 100 characters, it will be truncated to use only the first 100 characters.
When Smart Fix is enabled (flaw_detect and auto_fix_enabled are set to true):
The default name will be either the original file name (for a local file) or the filename portion of the URL path (for a URL). If you specify a custom video name via file_name, the file_name value will be the name of the fixed video.

Note: Videos under the same advertiser_id cannot have duplicated file names. You can call /file/name/check/ to check whether the file name has been used.
If you get an error about duplicated file names, please rename the files or append timestamps to the original file names (for example, in the format of _, and upload the videos again.

upload_type
	
string
	
Video upload method.

Default value: UPLOAD_BY_FILE

Enum values: UPLOAD_BY_FILE, UPLOAD_BY_URL, UPLOAD_BY_FILE_ID, UPLOAD_BY_VIDEO_ID.

Note: If you set this field to UPLOAD_BY_FILE, UPLOAD_BY_URL or UPLOAD_BY_FILE_ID, a new video ID (video_id) will be returned. If you upload the same video multiple times using any of these three methods, you'll obtain a new video ID for each upload.

video_file
Conditional
	
file
	
Required when upload_type is UPLOAD_BY_FILE.

Video file.

Recommended settings：
(1) File size：500 MB limit
(2) ratio：9:16, 16:9, and 1:1.
(3) Format：.mp4, .mov, .mpeg, .avi.

Example: 'video_file=@"/Users/admin/Downloads/sample-mov-file.mov"'

Note: Before uploading, make sure that the file is playable and in a supported format.

video_signature
Conditional
	
string
	
Required when upload_type is UPLOAD_BY_FILE.

Video MD5 (used for server verification).

video_url
Conditional
	
string
	
Required when upload_type is UPLOAD_BY_URL.

Video URL address, such as http://xxx.xxx.
(1) File size: better within 10MB.
(2) Verification: We will verify Content-Type in the response header. A common invalid media type is text (Content-Type = text/*, such as text/html, text/plain). Also, we will verify the data if you set a Content-MD5 in the response header.
(3) Encoding: The URL needs to be a valid URL in the browser. For instance, the spaces in the URL need to be encoded into %20. You can copy and paste the URL into a browser address bar, then the URL will be automatically encoded.
(4) Others: ratio, format, resolution and bitrate limitation is the same as video_file.

Note: Before uploading, make sure that the video URL is playable and in a supported format. If the URL is invalid or in an unsupported format (i.e. txt.), you may see an error message or obtain an invalid video ID that cannot be used for ad creation.

file_id
Conditional
	
string
	
Required when upload_type is UPLOAD_BY_FILE_ID.

The file_id of the file that you want to upload. This field is for files that are uploaded to the file repository. You can get file_id via the Upload Files endpoints.

video_id
Conditional
	
string
	
Required when upload_type is UPLOAD_BY_VIDEO_ID.

Video ID.

Note: You should pass in the video_id of the videos created on TikTok Ads Manager or through API. If you pass in the value from other sources, you may see an error message or cannot use the uploaded video for ad creation.
You can obtain video_id in the response of the /file/video/ad/upload/ endpoint or by using the /file/video/ad/search/ endpoint.

is_third_party
	
boolean
	
The video is third party or not.

flaw_detect
	
boolean
	
Whether to automatically detect an issue in your video.

Default value: false.

auto_fix_enabled
	
boolean
	
Whether to automatically fix the detected issue.

Default value : false.

If an issue is detected in your video:
When auto_fix_enabled is set to false, we'll return an error message with flaw types indicated.
When auto_fix_enabled is set to true, we'll automatically fix the LOW_RESOLUTION and ILLEGAL_VIDEO_SIZE issues and return fix_task_id and flaw_types.

Note:

When a LOW_RESOLUTION issue is detected, the video is automatically enhanced to a standard resolution of 1280x720 pixels, also referred to as 720p.
When an ILLEGAL_VIDEO_SIZE issue is detected, the video is automatically adjusted to one of the standard aspect ratios: 1:1 (square), 9:16 (vertical), or 16:9 (horizontal).

auto_bind_enabled
	
boolean
	
Valid only when flaw_detect = true and auto_fix_enabled = true.

Whether to automatically upload the fixed video to your creative library.

Default value : false.
Example
Upload by file with Smart Fix enabled
curl --location --request POST 'https://business-api.tiktok.com/open_api/v1.3/file/video/ad/upload/' \
--header 'Access-Token: {{Access-Token}}' \
--form 'advertiser_id="{{advertiser_id}}"' \
--form 'file_name="{{file_name}}"' \
--form 'upload_type="UPLOAD_BY_FILE"' \
--form 'video_file=@"/Desktop/Example.mp4"' \
--form 'video_signature="{{video_signature}}"' \
--form 'flaw_detect="true"' \
--form 'auto_fix_enabled="true"' \
--form 'auto_bind_enabled="true"'

Upload by file with Smart Fix disabled
curl --location --request POST 'https://business-api.tiktok.com/open_api/v1.3/file/video/ad/upload/' \
--header 'Access-Token: {{Access-Token}}' \
--form 'advertiser_id="{{advertiser_id}}"' \
--form 'file_name="{{file_name}}"' \
--form 'upload_type="UPLOAD_BY_FILE"' \
--form 'video_file=@"/Desktop/Example.mp4"' \
--form 'video_signature="{{video_signature}}"' 

Upload by URL with Smart Fix enabled
curl --location  --request POST 'https://business-api.tiktok.com/open_api/v1.3/file/video/ad/upload/' \
--header 'Access-Token: {{Access-Token}}' \
--data '{
    "advertiser_id":"{{advertiser_id}}",
    "file_name":"{{file_name}}",
    "upload_type":"UPLOAD_BY_URL",
    "video_url":"{{video_url}}",
    "flaw_detect":true,
    "auto_fix_enabled":true,
    "auto_bind_enabled":true
}'

Response
Field	Data Type	Description

code
	
number
	
Response code. For the complete list of response codes and descriptions, see Appendix - Return Codes.

message
	
string
	
Response message. For details, see Appendix - Return Codes.

request_id
	
string
	
The log id of a request, which uniquely identifies the request.

data
	
object[]
	
Returned data. For compatibility reasons, an array, instead of an object, is returned, and the array contains only one object.

Note: Due to the latency between client and server, it is possible that only video_id is returned. In this case, you can wait for 30 seconds to five minutes and use the /file/video/ad/search/ endpoint to retrieve other data.

video_cover_url
	
string
	
Temporary URL for video cover, valid for six hours and needs to be re-acquired after expiration.
The expiration time is included in the URL after the x-expires parameter, in the format of an Epoch/Unix timestamp in seconds.
Example: http://p16-sign-sg.tiktokcdn.com/v0201/b99a388e3709470be5c~tplv-noop.image?x-expires=1671742348&x-signature=FziJhvED9NDTDmPofv3I%3D.

format
	
string
	
Video format.

preview_url
	
string
	
Video preview link, valid for six hours and needs to be re-acquired after expiration.
To find out the expiration time of the preview link, see preview_url_expire_time.

preview_url_expire_time
	
string
	
The expiration time of the video preview link, in the format of YYYY-MM-DD HH:MM:SS (UTC+0).

file_name
	
string
	
Video name.

displayable
	
boolean
	
Whether it can be displayed on the platform.

height
	
number
	
Video height.

width
	
number
	
Video width.

bit_rate
	
number
	
Bit rate in bps.

create_time
	
string
	
Creation time. UTC time. Format: 2020-06-10T07:39:14Z.

modify_time
	
string
	
Modification time. UTC time. Format: 2020-06-10T07:39:14Z.

signature
	
string
	
Video file MD5.

duration
	
float
	
Video duration, in seconds.

video_id
	
string
	
Video ID, which can be used to create ads.

Note:

If you upload via video ID (upload_type as UPLOAD_BY_VIDEO_ID), the same video ID will be returned.
If you upload via file , URL or file ID (upload_type as UPLOAD_BY_FILE, UPLOAD_BY_URL or UPLOAD_BY_FILE_ID), a new video ID (video_id) will be returned. If you upload the same video multiple times using any of these three methods, you'll obtain a new video ID for each upload.

size
	
number
	
Video size, in bytes.

material_id
	
string
	
Material ID

allowed_placements
	
string[]
	
Available placements. Due to music copyright, some materials generated by creative tools can only be shown on TikTok. It won't pass when they are created on other placements. For enum values, see Enumerations-Ad Management-Placement.

Note: The values PLACEMENT_TOPBUZZ and PLACEMENT_HELO for this field cannot be used for ad creation and will be deprecated in the next API version.

allow_download
	
boolean
	
Whether the video is downloadable. Due to the music copyright, some materials generated by creative tools are only allowed to preview. It is prohibited to download and disseminate them.

fix_task_id
	
string
	
Returned only when you've set both flaw_detect and auto_fix_enabled to true in request, and video issues are detected.

Fix task ID.

To obtain the fixed video, you can use one of the following methods:
Pass the value of this field to the task_id field in /video/fix/task/get/.
Retrieve the fixed video from /file/video/ad/search/ if you have set auto_bind_enabled to true in the request.

flaw_types
	
string[]
	
Returned only when you've set both flaw_detect and auto_fix_enabled to true in request, and video issues are detected.

Video issue types.

Enum values:
LOW_RESOLUTION: Video resolution is lower than 540x960 px, which doesn't meet our requirements.
ILLEGAL_VIDEO_SIZE: The video size is not correct. Use the standard video size: Square (1:1) / Vertical (9:16) / Horizontal (16:9).
NO_BGM(deprecated): The ad or video has no background audio, or the background audio is incoherent/unclear.
BLACK_EDGE(deprecated) : A video image contains black bars, which affects user experience and is not allowed.
ILLEGAL_DURATION(deprecated): Video length is either longer than 60s or shorter than 5s, which doesn't meet our requirements.
Example
Upload by file with Smart Fix enabled and issue detected
HTTPS/1.1 200 OK
{
    "code": 0,
    "message": "OK",
    "request_id": "{{request_id}}",
    "data": [
        {
            "fix_task_id": "{{fix_task_id}}",
            "flaw_types": [
                "LOW_RESOLUTION"
            ]
        }
    ]
}

Upload by file with Smart Fix disabled

Note
Due to the latency between client and server, it is possible that only video_id is returned. In this case, you can wait for 30 seconds to five minutes and use the /file/video/ad/search/ endpoint to retrieve other data.

HTTPS/1.1 200 OK
{
    "code": 0,
    "message": "OK",
    "request_id": "{{request_id}}",
    "data": [
        {
            "video_id": "{{video_id}}"
        }
    ]
}

Upload by URL with Smart Fix enabled and issue detected
HTTPS/1.1 200 OK
{
    "code": 0,
    "message": "OK",
    "request_id": "{{request_id}}",
    "data": [
        {
            "fix_task_id": "{{fix_task_id}}",
            "flaw_types": [
                "ILLEGAL_VIDEO_SIZE"
            ]
        }
    ]
}

Was the information helpful?
Yes
No