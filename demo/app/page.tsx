import { SDLT_JURISDICTION, SDLT_RATES_EFFECTIVE_FROM } from 'property-calculators';

import Calculator from './components/Calculator';
import Mortgage from './components/Mortgage';
import StampDuty from './components/StampDuty';

export default function Page() {
    return (
        <main className="handmade">
            <header>
                <h1>property-calculators</h1>
                <p>
                    Every number, label and table row below comes from the library. This app only draws them. SDLT rates
                    for {SDLT_JURISDICTION}, in force from {SDLT_RATES_EFFECTIVE_FROM}. Estimates, not advice.
                </p>
            </header>

            <StampDuty />
            <Mortgage />
            <Calculator />

            <footer>
                Don&rsquo;t want to build the UI? See the <a href="/components-demo">ready-made components</a>. The JSON
                endpoint is live too:{' '}
                <a href="/api/stamp-duty/750000?ukResident=true">/api/stamp-duty/750000?ukResident=true</a>
            </footer>
        </main>
    );
}
