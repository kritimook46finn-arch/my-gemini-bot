export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ reply: 'Method not allowed' });
    }

    try {
        const { message } = req.body;
        const apiKey = process.env.GEMINI_API_KEY; 

        if (!apiKey) {
            return res.status(500).json({ reply: 'ข้อผิดพลาด: ไม่พบ API Key บน Vercel' });
        }
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: message }] }]
            })
        });

        const data = await response.json();
        
        // ดักจับกรณีที่ Google ส่ง Error กลับมา (เช่น Key ผิด หรือ โควตาเต็ม)
        if (data.error) {
            return res.status(500).json({ reply: `Google API Error: ${data.error.message}` });
        }

        // ตรวจสอบโครงสร้างข้อมูลก่อนดึงข้อความ เพื่อป้องกันการเกิด undefined
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
            const reply = data.candidates[0].content.parts[0].text;
            return res.status(200).json({ reply });
        } else {
            return res.status(500).json({ reply: 'โครงสร้างข้อมูลจาก Google API ไม่ถูกต้อง' });
        }

    } catch (error) {
        return res.status(500).json({ reply: `เกิดข้อผิดพลาดฝั่ง Server: ${error.message}` });
    }
}
