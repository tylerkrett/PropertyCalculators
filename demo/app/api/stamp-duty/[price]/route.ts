import { getStampDutyResponse } from 'property-calculators';

/** GET /api/stamp-duty/750000?ukResident=true&firstTimeBuyer=false&secondHome=false */
export async function GET(request: Request, { params }: { params: Promise<{ price: string }> }) {
    const { price } = await params;
    const query = Object.fromEntries(new URL(request.url).searchParams);

    if (!/^\d+(\.\d+)?$/.test(price)) return Response.json({ error: 'price must be a number' }, { status: 400 });

    return Response.json(getStampDutyResponse({ ...query, price }));
}
