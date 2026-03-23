/**
 * AppNameMapper — translates Android package names into human-readable app info.
 *
 * For known apps, returns a hand-curated name, Ionicons icon, and brand colour.
 * For unknown packages, derives a name from the last component of the package
 * identifier and assigns a deterministic colour from a small palette.
 */

export interface AppInfo {
  name: string;
  icon: string;
  color: string;
  category: 'social' | 'video' | 'gaming' | 'productivity' | 'messaging' | 'entertainment' | 'other';
}

const KNOWN_APPS: Record<string, AppInfo> = {
  'com.instagram.android':                { name: 'Instagram',      icon: 'logo-instagram',  color: '#E1306C', category: 'social'         },
  'com.zhiliaoapp.musically':             { name: 'TikTok',         icon: 'play-circle',     color: '#69C9D0', category: 'social'         },
  'com.ss.android.ugc.trill':            { name: 'TikTok',         icon: 'play-circle',     color: '#69C9D0', category: 'social'         },
  'com.twitter.android':                  { name: 'X (Twitter)',    icon: 'logo-twitter',    color: '#1DA1F2', category: 'social'         },
  'com.google.android.youtube':           { name: 'YouTube',        icon: 'logo-youtube',    color: '#FF0000', category: 'video'          },
  'com.facebook.katana':                  { name: 'Facebook',       icon: 'logo-facebook',   color: '#1877F2', category: 'social'         },
  'com.snapchat.android':                 { name: 'Snapchat',       icon: 'camera',          color: '#FFDD00', category: 'social'         },
  'com.reddit.frontpage':                 { name: 'Reddit',         icon: 'logo-reddit',     color: '#FF4500', category: 'social'         },
  'com.whatsapp':                         { name: 'WhatsApp',       icon: 'logo-whatsapp',   color: '#25D366', category: 'messaging'      },
  'com.linkedin.android':                 { name: 'LinkedIn',       icon: 'logo-linkedin',   color: '#0A66C2', category: 'social'         },
  'com.google.android.gm':               { name: 'Gmail',          icon: 'mail',            color: '#EA4335', category: 'productivity'   },
  'com.spotify.music':                    { name: 'Spotify',        icon: 'musical-notes',   color: '#1DB954', category: 'entertainment'  },
  'com.netflix.mediaclient':              { name: 'Netflix',        icon: 'tv',              color: '#E50914', category: 'video'          },
  'com.discord':                          { name: 'Discord',        icon: 'chatbubbles',     color: '#5865F2', category: 'messaging'      },
  'com.pinterest':                        { name: 'Pinterest',      icon: 'logo-pinterest',  color: '#E60023', category: 'social'         },
  'com.google.android.apps.youtube.music': { name: 'YT Music',     icon: 'musical-note',    color: '#FF0000', category: 'entertainment'  },
  'com.amazon.mShop.android.shopping':   { name: 'Amazon',         icon: 'bag-handle',      color: '#FF9900', category: 'other'          },
  'com.twitch.android.app':              { name: 'Twitch',         icon: 'logo-twitch',     color: '#9146FF', category: 'video'          },
  'org.telegram.messenger':              { name: 'Telegram',       icon: 'send',            color: '#2CA5E0', category: 'messaging'      },
  'com.tinder':                           { name: 'Tinder',         icon: 'flame',           color: '#FE3C72', category: 'social'         },
  'com.bumble.app':                       { name: 'Bumble',         icon: 'heart',           color: '#FFD900', category: 'social'         },
  'com.king.candycrushsaga':             { name: 'Candy Crush',    icon: 'game-controller', color: '#FF4E00', category: 'gaming'         },
  'com.supercell.clashofclans':          { name: 'Clash of Clans', icon: 'game-controller', color: '#4E5AF2', category: 'gaming'         },
  'com.roblox.client':                   { name: 'Roblox',         icon: 'game-controller', color: '#E42B24', category: 'gaming'         },
  'com.epicgames.fortnite':              { name: 'Fortnite',       icon: 'game-controller', color: '#7B2FBE', category: 'gaming'         },
  'com.google.android.chrome':           { name: 'Chrome',         icon: 'globe',           color: '#4285F4', category: 'productivity'   },
  'org.mozilla.firefox':                 { name: 'Firefox',        icon: 'globe',           color: '#FF7139', category: 'productivity'   },
  'com.microsoft.teams':                 { name: 'Teams',          icon: 'people',          color: '#6264A7', category: 'productivity'   },
  'com.slack':                           { name: 'Slack',          icon: 'chatbubble',      color: '#4A154B', category: 'productivity'   },
  'com.facebook.orca':                   { name: 'Messenger',      icon: 'chatbubbles',     color: '#0084FF', category: 'messaging'      },
  'com.google.android.apps.maps':        { name: 'Google Maps',    icon: 'map',             color: '#4285F4', category: 'productivity'   },
  'com.google.android.apps.messaging':   { name: 'Messages',       icon: 'chatbubble',      color: '#1A73E8', category: 'messaging'      },
  'tv.twitch.android.app':              { name: 'Twitch',         icon: 'logo-twitch',     color: '#9146FF', category: 'video'          },
  'com.hbo.hbonow':                      { name: 'HBO Max',        icon: 'tv',              color: '#002FF3', category: 'video'          },
  'com.disneyplus':                      { name: 'Disney+',        icon: 'tv',              color: '#113CCF', category: 'video'          },
  'com.amazon.avod.thirdpartyclient':    { name: 'Prime Video',    icon: 'tv',              color: '#00A8E1', category: 'video'          },
};

const FALLBACK_COLORS = ['#8B8FA8', '#6B9FD4', '#7EC8A4', '#D4916B', '#C47EC8', '#E8A97E'];

export function getAppInfo(packageName: string): AppInfo {
  if (KNOWN_APPS[packageName]) return KNOWN_APPS[packageName];

  const parts = packageName.split('.');
  let appName = parts[parts.length - 1] ?? packageName;
  appName = appName.charAt(0).toUpperCase() + appName.slice(1).replace(/([A-Z])/g, ' $1').trim();

  const colorIdx =
    packageName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % FALLBACK_COLORS.length;

  return {
    name: appName,
    icon: 'apps',
    color: FALLBACK_COLORS[colorIdx],
    category: 'other',
  };
}

export function isKnownApp(packageName: string): boolean {
  return packageName in KNOWN_APPS;
}
