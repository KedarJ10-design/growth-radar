export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
      <h1 style={{ marginBottom: '20px' }}>Privacy Policy for Radar System</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>Last updated: {new Date().toLocaleDateString()}</p>
      
      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ marginBottom: '12px' }}>1. Introduction</h2>
        <p>Welcome to Radar System (also known as Growth Radar). This is a personal, private productivity and scheduling application. Your privacy and data security are our top priorities.</p>
      </section>

      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ marginBottom: '12px' }}>2. Data Collection and Usage</h2>
        <p>This application collects personal activity logs and dimension scores to generate personalized AI schedules. All this data is stored in a private, authenticated database accessible only to the owner via a secure PIN.</p>
      </section>

      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ marginBottom: '12px' }}>3. Google Calendar Integration</h2>
        <p>Our app integrates with Google Calendar to export your AI-generated schedules. We request the following permissions:</p>
        <ul style={{ listStyleType: 'disc', paddingLeft: '20px', marginTop: '10px' }}>
          <li><strong>View and edit events on all your calendars:</strong> We use this strictly to insert new events (your generated schedule) into your calendar. We do NOT read, delete, or share your existing calendar events with any third parties.</li>
        </ul>
        <p style={{ marginTop: '10px' }}>Radar System's use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
      </section>

      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ marginBottom: '12px' }}>4. Data Sharing</h2>
        <p>Your data is completely private. We do not sell, trade, or rent your personal information to others. The only external service your data interacts with is the Groq AI API (for generating the schedule) and Google Calendar (for exporting the schedule).</p>
      </section>

      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ marginBottom: '12px' }}>5. Contact</h2>
        <p>If you have any questions about this Privacy Policy, please contact the developer directly.</p>
      </section>
      
      <a href="/" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>&larr; Back to Home</a>
    </div>
  );
}
