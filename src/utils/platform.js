// src/utils/platform.js
export class PlatformUtils {
  constructor() {
    this.platforms = [
      {
        name: 'linkedin',
        patterns: [
          /linkedin\.com\/jobs\/view/,
          /linkedin\.com\/jobs\/search/
        ],
        test: (url) => {
          return /linkedin\.com/.test(url) &&
                 (url.includes('/jobs/') || url.includes('/job/'));
        }
      },
      {
        name: 'naukri',
        patterns: [
          /naukri\.com\/job-listings/,
          /naukri\.com\/job-details/
        ],
        test: (url) => {
          return /naukri\.com/.test(url) &&
                 (url.includes('/job') || url.includes('/jobs'));
        }
      },
      {
        name: 'greenhouse',
        patterns: [
          /boards\.greenhouse\.io/
        ],
        test: (url) => {
          return /boards\.greenhouse\.io/.test(url);
        }
      },
      {
        name: 'lever',
        patterns: [
          /lever\.co/
        ],
        test: (url) => {
          return /lever\.co/.test(url);
        }
      },
      {
        name: 'workday',
        patterns: [
          /myworkdayjobs\.com/
        ],
        test: (url) => {
          return /myworkdayjobs\.com/.test(url);
        }
      }
    ];
  }

  detect(url) {
    if (!url) return 'unknown';

    for (const platform of this.platforms) {
      if (platform.test(url)) {
        return platform.name;
      }
    }

    // Check if it's a generic career page
    if (this.isCareerPage(url)) {
      return 'generic';
    }

    return 'unknown';
  }

  isCareerPage(url) {
    const careerIndicators = [
      'career', 'jobs', 'employment', 'opportunities',
      'join-us', 'work-with-us', 'careers'
    ];

    const urlLower = url.toLowerCase();
    return careerIndicators.some(indicator => urlLower.includes(indicator));
  }

  getPlatformName(url) {
    const platform = this.detect(url);
    if (platform === 'unknown') {
      try {
        const hostname = new URL(url).hostname;
        const parts = hostname.split('.');
        if (parts.length > 1) {
          return parts[parts.length - 2] || 'unknown';
        }
        return hostname;
      } catch (e) {
        return 'unknown';
      }
    }
    return platform;
  }

  getPlatformIcon(platform) {
    const icons = {
      linkedin: '🔗',
      naukri: '💼',
      greenhouse: '🌱',
      lever: '⚙️',
      workday: '📅',
      generic: '🌐'
    };
    return icons[platform] || '📋';
  }

  getPlatformDisplayName(platform) {
    const names = {
      linkedin: 'LinkedIn',
      naukri: 'Naukri',
      greenhouse: 'Greenhouse',
      lever: 'Lever',
      workday: 'Workday',
      generic: 'Career Page'
    };
    return names[platform] || platform.charAt(0).toUpperCase() + platform.slice(1);
  }
}

export const PLATFORM = new PlatformUtils();