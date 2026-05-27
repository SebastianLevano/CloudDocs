import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { LandingPage } from './landing.page';

describe('LandingPage', () => {
  it('renders the hero headline', async () => {
    TestBed.configureTestingModule({
      imports: [LandingPage],
      // RouterLink (Sign in / Get started) needs the router providers.
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });

    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Intelligent document');
    expect(element.textContent).toContain('management');
  });
});
