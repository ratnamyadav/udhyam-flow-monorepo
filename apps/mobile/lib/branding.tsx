import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { trpc } from './trpc';

// Tenant branding for the public booking screens. Colors are applied with
// inline styles (NativeWind classes can't take runtime values); fonts stay
// system on mobile.

export type BrandColors = {
  accent: string;
  accentSoft: string;
  accentInk: string;
  /** Readable text/icon color on `accent` (white or ink, chosen server-side). */
  accentFg: string;
  radius: number;
};

// Neutral ink theme while branding loads or if it fails — matches the app's
// default look, so nothing flashes a wrong brand color.
const NEUTRAL: BrandColors = {
  accent: '#1a1815',
  accentSoft: '#f5f4f0',
  accentInk: '#1a1815',
  accentFg: '#ffffff',
  radius: 8,
};

export function useTenantBranding(orgSlug: string | undefined) {
  const query = trpc.tenant.publicBranding.useQuery(
    { orgSlug: orgSlug ?? '' },
    { enabled: !!orgSlug, staleTime: 5 * 60_000 },
  );
  const b = query.data;
  const colors: BrandColors = b
    ? {
        accent: b.accent,
        accentSoft: b.accentSoft,
        accentInk: b.accentInk,
        accentFg: b.accentFg,
        radius: b.radius,
      }
    : NEUTRAL;
  return { branding: b ?? null, colors, isLoading: query.isLoading };
}

type Branding = NonNullable<ReturnType<typeof useTenantBranding>['branding']>;

/** Uploaded logo image, or the logo text on an accent badge. */
export function BrandLogo({
  branding,
  colors,
  size = 40,
}: {
  branding: Branding;
  colors: BrandColors;
  size?: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const radius = Math.min(colors.radius, size / 2);
  if (branding.logoUrl && !imageFailed) {
    return (
      <Image
        source={{ uri: branding.logoUrl }}
        accessibilityLabel={`${branding.name} logo`}
        resizeMode="contain"
        onError={() => setImageFailed(true)}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#ffffff' }}
      />
    );
  }
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{ color: colors.accentFg, fontWeight: '600', fontSize: Math.round(size * 0.32) }}
      >
        {branding.logoText}
      </Text>
    </View>
  );
}

/** Logo + business name row used at the top of the booking screens. */
export function BrandHeader({ branding, colors }: { branding: Branding; colors: BrandColors }) {
  return (
    <View className="flex-row items-center gap-3">
      <BrandLogo branding={branding} colors={colors} />
      <Text className="text-base font-semibold text-ink flex-1" numberOfLines={2}>
        {branding.name}
      </Text>
    </View>
  );
}
