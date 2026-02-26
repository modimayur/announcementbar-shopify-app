import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { insertAnnouncementHistory } from "../mongo.server";

const SHOP_ID_AND_METAFIELD = `#graphql
  query ShopIdAndAnnouncement {
    shop {
      id
      metafield(namespace: "my_app", key: "announcement") {
        value
      }
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        key
        namespace
        value
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(SHOP_ID_AND_METAFIELD);
  const json = await response.json();
  const shop = json?.data?.shop;
  const currentValue =
    shop?.metafield?.value ?? "";
  return { currentAnnouncement: currentValue };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return { ok: false, error: "Method not allowed" };
  }
  const formData = await request.formData();
  const text = String(formData.get("announcement") ?? "").trim();

  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const idResponse = await admin.graphql(SHOP_ID_AND_METAFIELD);
  const idJson = await idResponse.json();
  const shopId = idJson?.data?.shop?.id;
  if (!shopId) {
    return { ok: false, error: "Could not get shop id" };
  }

  try {
    await insertAnnouncementHistory({
      text,
      timestamp: new Date(),
      shopId,
      shopDomain,
    });
  } catch (e) {
    console.error("MongoDB insert failed:", e);
    return { ok: false, error: "Failed to save audit history" };
  }

  const setResponse = await admin.graphql(METAFIELDS_SET, {
    variables: {
      metafields: [
        {
          ownerId: shopId,
          namespace: "my_app",
          key: "announcement",
          type: "single_line_text_field",
          value: text,
        },
      ],
    },
  });
  const setJson = await setResponse.json();
  const userErrors = setJson?.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    return {
      ok: false,
      error: userErrors.map((e: { message: string }) => e.message).join(", "),
    };
  }

  return { ok: true };
};

export default function AnnouncementPage() {
  const { currentAnnouncement } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [value, setValue] = useState(currentAnnouncement);

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    setValue(currentAnnouncement);
  }, [currentAnnouncement]);

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Announcement saved");
    }
    if (fetcher.data && !fetcher.data.ok && fetcher.data.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Announcement Banner">
      <s-section heading="Announcement Text">
        <s-paragraph>
          Set the announcement text that will appear on your storefront. It is
          saved to your shop metafield and shown via the theme app extension.
        </s-paragraph>
        <fetcher.Form method="post">
          <s-text-field
            name="announcement"
            label="Announcement Text"
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            multiline
          />
          <s-stack direction="inline" gap="base" style={{ marginTop: "1rem" }}>
            <s-button type="submit" disabled={isLoading} {...(isLoading ? { loading: true } : {})}>
              Save
            </s-button>
          </s-stack>
        </fetcher.Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
