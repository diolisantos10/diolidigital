// After OAuth, discover which assets the authenticated user granted us:
// Facebook Pages (each with its own long-lived Page token) and the Instagram
// Business account linked to each Page. SERVER-ONLY.

import { graphGet } from "./graph";

export interface DiscoveredPage {
  id: string;
  name: string;
  accessToken: string; // Page access token (does not expire for long-lived users)
  instagram?: { id: string; username?: string };
}

interface MeAccountsResponse {
  data?: Array<{
    id: string;
    name: string;
    access_token: string;
    instagram_business_account?: { id: string; username?: string };
  }>;
  paging?: { next?: string };
}

// Fetch all Pages the user manages, including the linked IG business account.
export async function discoverPages(userAccessToken: string): Promise<DiscoveredPage[]> {
  const pages: DiscoveredPage[] = [];
  let next: string | undefined;

  // Follow pagination up to a sane cap.
  for (let i = 0; i < 10; i++) {
    const res: MeAccountsResponse = next
      ? await graphGet<MeAccountsResponse>(next, userAccessToken)
      : await graphGet<MeAccountsResponse>("me/accounts", userAccessToken, {
          fields: "id,name,access_token,instagram_business_account{id,username}",
          limit: 100,
        });

    for (const p of res.data ?? []) {
      pages.push({
        id: p.id,
        name: p.name,
        accessToken: p.access_token,
        instagram: p.instagram_business_account
          ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username }
          : undefined,
      });
    }
    next = res.paging?.next;
    if (!next) break;
  }

  return pages;
}
