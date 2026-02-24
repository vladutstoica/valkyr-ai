import React from 'react';
import valkyrLogo from '../../assets/images/valkyr/valkyr_logo.svg';
import valkyrLogoWhite from '../../assets/images/valkyr/valkyr_logo_white.svg';
import { useTheme } from '../hooks/useTheme';

const HomeView: React.FC = () => {
  const { effectiveTheme } = useTheme();

  return (
    <div className="bg-background text-foreground flex h-full flex-col overflow-y-auto">
      <div className="container mx-auto flex min-h-full max-w-3xl flex-1 flex-col justify-center px-8 py-8">
        <div className="mb-3 text-center">
          <div className="mb-3 flex items-center justify-center">
            <div className="logo-shimmer-container">
              <img
                key={effectiveTheme}
                src={
                  effectiveTheme === 'dark' || effectiveTheme === 'dark-black'
                    ? valkyrLogoWhite
                    : valkyrLogo
                }
                alt="Valkyr"
                className="logo-shimmer-image"
              />
              <span
                className="logo-shimmer-overlay"
                aria-hidden="true"
                style={{
                  WebkitMaskImage: `url(${effectiveTheme === 'dark' || effectiveTheme === 'dark-black' ? valkyrLogoWhite : valkyrLogo})`,
                  maskImage: `url(${effectiveTheme === 'dark' || effectiveTheme === 'dark-black' ? valkyrLogoWhite : valkyrLogo})`,
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
