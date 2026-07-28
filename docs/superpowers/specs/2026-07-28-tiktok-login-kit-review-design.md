# TikTok Login Kit Review Readiness Design

## Goal

Prepare the `LTTH.APP LOGIN` TikTok developer app as a saved draft that is ready
for review. The integration is limited to TikTok Login Kit; no Display API,
Content Posting API, or other TikTok product or scope is requested.

## Public Website

Add public English Terms of Service and Privacy Policy pages at the `ltth.app`
website root. They must be linked by stable HTTPS URLs and explain the
Login-Kit-specific handling: LTTH uses TikTok login only to authenticate the
user and retrieve the basic account identity needed to associate that login
with an LTTH session. The pages must identify the service, the applicable
contact channel, retention/deletion path, and the absence of unrelated TikTok
data collection.

## TikTok Developer Draft

Use the existing LTTH square product icon. Set the category to the closest
available tools/utility category, select Web and Desktop, and use a concise
description that accurately says LTTH is a local TikTok LIVE creator tool and
uses Login Kit solely for account sign-in.

The review explanation must state the same limited purpose and explicitly say
that no other TikTok APIs or scopes are used.

## Demo Video

Produce one short MP4 containing readable screenshots and captions for the
complete intended flow: launch LTTH, choose TikTok login, authorize with
TikTok, return to LTTH, and see the authenticated account state. Screenshots
must use the actual LTTH interface where available. Where the TikTok
authorization screen cannot be safely automated, an accurately labelled
visual step may be used; it must not claim a successful live authorization
that has not occurred.

## Safety and Completion

Save the completed app draft and upload the icon and demo video, but do not
click TikTok's final **Submit for review** control. Verify the public page URLs
load and that TikTok no longer shows missing mandatory basic information or
review assets.
