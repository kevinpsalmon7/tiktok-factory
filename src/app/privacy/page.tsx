import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy — TikTok Factory',
  description: 'Privacy Policy for TikTok Factory, an AI-powered TikTok carousel generation tool for independent content creators.',
}

const CONTACT_EMAIL = 'kevinpsalmon@gmail.com'
const EFFECTIVE_DATE = 'May 18, 2025'
const APP_NAME = 'TikTok Factory'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-cream-50 py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <Link href="/dashboard" className="text-sm text-ink-500 hover:text-ink-900 transition">
            ← Back to app
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-soft p-10 space-y-10">
          <div>
            <h1 className="font-display text-4xl font-bold text-ink-900 mb-2">Privacy Policy</h1>
            <p className="text-sm text-ink-500">Effective date: {EFFECTIVE_DATE} — Last updated: {EFFECTIVE_DATE}</p>
          </div>

          <Section title="1. Introduction">
            <p>
              {APP_NAME} (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is an AI-powered tool designed exclusively
              for independent TikTok content creators. It enables individual creators to generate
              carousel-format content for TikTok using AI-assisted writing and image generation.
              {APP_NAME} is intended solely for personal, non-commercial use by independent authors
              managing their own TikTok presence — not for agencies, brands, or automated bulk publishing.
            </p>
            <p>
              This Privacy Policy explains how we collect, use, store, and protect your personal
              information when you use our application.
            </p>
            <p>
              By accessing or using {APP_NAME}, you agree to the practices described in this policy.
              If you do not agree, please discontinue use of the service.
            </p>
          </Section>

          <Section title="2. Data We Collect">
            <SubSection title="2.1 Account Information">
              <ul>
                <li>Email address (used for authentication and account identification)</li>
                <li>Display name (optional, set by you in settings)</li>
                <li>Profile avatar URL (optional, from your authentication provider)</li>
              </ul>
            </SubSection>
            <SubSection title="2.2 User-Provided Content">
              <ul>
                <li>Carousel templates you create, including layout configurations, style guides, and instructions</li>
                <li>Prompts and text instructions submitted to generate carousel content</li>
                <li>Images uploaded as reference material for generation</li>
                <li>Generated carousel content and associated metadata</li>
              </ul>
            </SubSection>
            <SubSection title="2.3 API Keys">
              <p>
                You may optionally store third-party API keys (Anthropic, OpenAI, Google Gemini) in
                your profile. These keys are stored in our database and are used exclusively to make
                API calls on your behalf. They are never displayed in plaintext after being saved, and
                are never shared with any party other than the respective API provider.
              </p>
            </SubSection>
            <SubSection title="2.4 Pinterest Data">
              <p>
                If you connect your Pinterest account or use Pinterest image search features within
                {APP_NAME}, we may access:
              </p>
              <ul>
                <li>Public pin images and metadata (title, description, source URL) returned by Pinterest search queries</li>
                <li>Your Pinterest access token, stored securely to authenticate requests on your behalf</li>
              </ul>
              <p>
                Pinterest data is used solely to display search results and allow you to select images
                as visual references or backgrounds for your carousel slides. We do not store Pinterest
                pin data beyond your active session, and we do not use Pinterest data for advertising,
                analytics, or any purpose other than the immediate display and selection within the app.
              </p>
            </SubSection>
            <SubSection title="2.5 Usage Logs">
              <p>
                We collect technical logs of generation requests (prompts sent, LLM responses, errors)
                for debugging purposes. These logs are associated with your user account and are
                retained for a limited period (see Section 6).
              </p>
            </SubSection>
          </Section>

          <Section title="3. How We Use Your Data">
            <p>We use your data for the following purposes only:</p>
            <ul>
              <li>To authenticate your identity and maintain your account session</li>
              <li>To generate carousel content using AI providers based on your instructions</li>
              <li>To save and retrieve your templates and generated carousels</li>
              <li>To perform image searches on Pinterest on your behalf when you initiate a search</li>
              <li>To diagnose and fix technical errors in the service</li>
              <li>To improve the quality and reliability of the service</li>
            </ul>
            <p>
              We do <strong>not</strong> sell, rent, or share your personal data with third parties for
              marketing or advertising purposes. We do not use your data to train AI models.
            </p>
          </Section>

          <Section title="4. Third-Party Services">
            <p>
              {APP_NAME} integrates with the following third-party services. Each service has its own
              privacy policy and data practices:
            </p>
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Purpose</th>
                  <th>Data shared</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Supabase</td>
                  <td>Database, authentication, file storage</td>
                  <td>Account data, templates, generated content, logs</td>
                </tr>
                <tr>
                  <td>Anthropic (Claude)</td>
                  <td>AI text generation</td>
                  <td>Your prompts and template instructions</td>
                </tr>
                <tr>
                  <td>OpenAI (GPT-4o, GPT Image)</td>
                  <td>AI text and image generation</td>
                  <td>Your prompts, template instructions, reference images</td>
                </tr>
                <tr>
                  <td>Google Gemini</td>
                  <td>AI text generation</td>
                  <td>Your prompts and template instructions</td>
                </tr>
                <tr>
                  <td>Pinterest API</td>
                  <td>Image search and retrieval</td>
                  <td>Search queries you enter; your Pinterest access token</td>
                </tr>
              </tbody>
            </table>
            <p>
              When you use your own API keys for Anthropic, OpenAI, or Gemini, requests are made
              directly from our server to the respective provider using your key. Your prompts and
              content are transmitted to those providers in accordance with their terms of service.
            </p>
          </Section>

          <Section title="5. Pinterest API — Specific Terms">
            <p>
              {APP_NAME} uses the Pinterest API in compliance with the{' '}
              <a href="https://policy.pinterest.com/en/developer-guidelines" target="_blank" rel="noopener noreferrer">
                Pinterest Developer Guidelines
              </a>{' '}
              and{' '}
              <a href="https://developers.pinterest.com/terms/" target="_blank" rel="noopener noreferrer">
                Pinterest API Terms of Service
              </a>.
            </p>
            <SubSection title="What we access">
              <ul>
                <li>Public pin search results via the <code>GET /v5/search/pins</code> endpoint</li>
                <li>Pin images, titles, and source URLs for display purposes only</li>
              </ul>
            </SubSection>
            <SubSection title="What we do NOT do">
              <ul>
                <li>We do not store Pinterest pin data or images on our servers beyond your active session</li>
                <li>We do not use Pinterest data to build user profiles or for advertising targeting</li>
                <li>We do not resell or redistribute Pinterest content or data</li>
                <li>We do not scrape Pinterest outside of authorized API endpoints</li>
                <li>We do not use Pinterest data in ways that compete with Pinterest&apos;s core products</li>
              </ul>
            </SubSection>
            <SubSection title="Revoking Pinterest access">
              <p>
                You can revoke {APP_NAME}&apos;s access to your Pinterest account at any time from your{' '}
                <a href="https://www.pinterest.com/settings/security" target="_blank" rel="noopener noreferrer">
                  Pinterest account security settings
                </a>. Upon revocation, your Pinterest access token is deleted from our database
                within 24 hours.
              </p>
            </SubSection>
          </Section>

          <Section title="6. Data Retention">
            <ul>
              <li><strong>Account data:</strong> retained for as long as your account is active</li>
              <li><strong>Templates and generated carousels:</strong> retained until you delete them or close your account</li>
              <li><strong>Generation logs:</strong> retained for 90 days, then automatically purged</li>
              <li><strong>Pinterest tokens:</strong> retained until you revoke access or delete your account; deleted within 24 hours of revocation</li>
              <li><strong>Pinterest search results:</strong> not persisted beyond your browser session</li>
              <li><strong>API keys:</strong> retained until you clear them from settings or delete your account</li>
            </ul>
            <p>
              To request deletion of your account and all associated data, contact us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </Section>

          <Section title="7. Data Security">
            <p>
              We take reasonable technical measures to protect your data:
            </p>
            <ul>
              <li>All data is transmitted over HTTPS/TLS</li>
              <li>API keys are stored in an encrypted database (Supabase) with row-level security policies</li>
              <li>Access to your data is restricted to your authenticated session only</li>
              <li>We do not log or display API keys after they are saved</li>
            </ul>
            <p>
              No system is completely secure. In the event of a data breach that affects your personal
              information, we will notify you by email within 72 hours of becoming aware.
            </p>
          </Section>

          <Section title="8. Your Rights">
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul>
              <li><strong>Access</strong> the personal data we hold about you</li>
              <li><strong>Correct</strong> inaccurate personal data</li>
              <li><strong>Delete</strong> your personal data (&quot;right to be forgotten&quot;)</li>
              <li><strong>Restrict</strong> or object to certain processing of your data</li>
              <li><strong>Data portability</strong> — receive your data in a machine-readable format</li>
            </ul>
            <p>
              To exercise any of these rights, email us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We will respond within 30 days.
            </p>
          </Section>

          <Section title="9. Cookies">
            <p>
              {APP_NAME} uses only strictly necessary cookies for session authentication (managed by
              Supabase Auth). We do not use advertising cookies, tracking pixels, or third-party
              analytics cookies.
            </p>
          </Section>

          <Section title="10. Eligibility and Age Restriction">
            <p>
              {APP_NAME} is intended exclusively for independent TikTok content creators who are
              at least 18 years of age (or the age of majority in their jurisdiction). The service
              is not directed at minors. We do not knowingly collect personal information from anyone
              under 18. If you believe a minor has registered an account, please contact us and we
              will delete it promptly.
            </p>
            <p>
              By using {APP_NAME}, you confirm that you are an independent individual creator and
              not acting on behalf of an agency, corporation, or automated content operation.
            </p>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. When we do, we will update the
              &quot;Last updated&quot; date at the top of this page. Continued use of the service after
              any changes constitutes your acceptance of the revised policy.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              For any questions, requests, or concerns regarding this Privacy Policy, please contact:
            </p>
            <p>
              <strong>{APP_NAME}</strong><br />
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </p>
          </Section>
        </div>

        <p className="text-center text-xs text-ink-400 mt-8">
          © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </p>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold text-ink-900 mb-4">{title}</h2>
      <div className="space-y-3 text-sm text-ink-700 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-ink-900 [&_a]:underline [&_a:hover]:text-ink-600 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_th]:text-left [&_th]:py-2 [&_th]:px-3 [&_th]:bg-cream-50 [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-ink-500 [&_td]:py-2 [&_td]:px-3 [&_td]:border-t [&_td]:border-cream-100 [&_td]:text-xs [&_code]:font-mono [&_code]:text-xs [&_code]:bg-cream-100 [&_code]:px-1 [&_code]:rounded">
        {children}
      </div>
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="font-semibold text-ink-800 mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}
