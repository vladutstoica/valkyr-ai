import React from 'react';
import logomarkBlack from '../../assets/images/valkyr/logomark-black.png';
import logomarkWhite from '../../assets/images/valkyr/logomark-white.png';
import { useTheme } from '../hooks/useTheme';

const HomeView: React.FC = () => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark' || effectiveTheme === 'dark-black';

  return (
    <div className="bg-background text-foreground flex h-full flex-col overflow-y-auto">
      <div className="container mx-auto flex min-h-full max-w-3xl flex-1 flex-col justify-center px-8 py-8">
        <div className="mb-3 text-center">
          <div className="mb-3 flex items-center justify-center">
            <div className="logo-shimmer-container">
              <img
                key={effectiveTheme}
                src={isDark ? logomarkWhite : logomarkBlack}
                alt="Valkyr"
                className="logo-shimmer-image"
              />
              <span
                className="logo-shimmer-overlay"
                aria-hidden="true"
                style={{
                  WebkitMaskImage: `url(${isDark ? logomarkWhite : logomarkBlack})`,
                  maskImage: `url(${isDark ? logomarkWhite : logomarkBlack})`,
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                }}
              />
            </div>
          </div>
          <p className="text-muted-foreground text-xs whitespace-nowrap">
            Run them all. Ship the best.
          </p>
        </div>
      </div>
    </div>
  );
};

export default HomeView;
