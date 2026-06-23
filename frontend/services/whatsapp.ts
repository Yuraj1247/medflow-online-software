
/**
 * Utility to send WhatsApp messages using Click-to-Chat (wa.me)
 * This does not require any paid API.
 */

export const sendWhatsAppMessage = (mobile: string, message: string) => {
    if (!mobile) return;

    // Clean the number and add 91 prefix if not present
    let cleanNumber = mobile.replace(/\D/g, "");
    if (cleanNumber.length === 10) {
        cleanNumber = "91" + cleanNumber;
    }

    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${cleanNumber}?text=${encodedMessage}`;

    window.open(url, "_blank");
};

interface RegistrationParams {
    patientTitle: string;
    patientName: string;
    uhid: string;
    age: string | number;
    sex: string;
    mobile: string;
    address: string;
    clinicName: string;
    doctorName: string;
    doctorDesignation: string;
    visitDate: string;
    visitNo: string;
    purpose: string;
}

export const formatRegistrationMessage = (params: RegistrationParams) => {
    return `*${params.clinicName}* 🏥
*Patient Registration Success*

*Patient Details*
${params.patientTitle} ${params.patientName}
*UHID:* ${params.uhid}
*Age/Sex:* ${params.age} Yrs / ${params.sex}
*Mobile:* ${params.mobile}
*Address:* ${params.address || '-'}

*Consultation Details*
*Consultant:* ${params.doctorName}
*Designation:* ${params.doctorDesignation}
*Visit No:* ${params.visitNo}
*Purpose:* ${params.purpose}
*Date:* ${params.visitDate}

We truly value your health and trust. Our team is committed to providing you with the best medical care. 😊`;
};

interface BillingParams {
    patientTitle: string;
    patientName: string;
    uhid: string;
    age: string | number;
    sex: string;
    mobile: string;
    address: string;
    consultantName: string;
    visitNo: string;
    paymentBy: string;
    paymentMode: string;
    billItems: string;
    subTotal: string | number;
    netTotal: string | number;
    clinicName: string;
    invoiceNo?: string;
    date?: string;
}

export const formatBillingMessage = (params: BillingParams) => {
    return `*${params.clinicName}* 🧾
    
*Invoice:* #${params.invoiceNo}
*Date:* ${params.date}

*Bill To*
${params.patientTitle} ${params.patientName}

*UHID:* ${params.uhid}
*Age/Sex:* ${params.age} Yrs / ${params.sex}
*Mobile:* ${params.mobile}
*Address:* ${params.address || '-'}

*Consultation Details*
*Consultant:* ${params.consultantName}
*Visit No:* ${params.visitNo}
*Payment By:* ${params.paymentBy}
*Payment Mode:* ${params.paymentMode}

*Particulars:*
${params.billItems}

*Sub Total:* ₹${params.subTotal}
*Net Total:* ₹${params.netTotal}

Thank you for your trust! 😊`;
};

interface PrescriptionParams {
    patientTitle: string;
    patientName: string;
    uhid: string;
    age: string | number;
    sex: string;
    mobile: string;
    address: string;
    clinicName: string;
    doctorName: string;
    doctorDesignation: string;
    visitNo: string;
    medicineList: string;
}

export const formatPrescriptionMessage = (params: PrescriptionParams) => {
    return `*${params.clinicName}* 💊
*Digital Prescription*

*Patient Details*
${params.patientTitle} ${params.patientName}
*UHID:* ${params.uhid}
*Age/Sex:* ${params.age} Yrs / ${params.sex}
*Mobile:* ${params.mobile}
*Address:* ${params.address || '-'}

*Consultation Details*
*Consultant:* ${params.doctorName}
*Designation:* ${params.doctorDesignation}
*Visit No:* ${params.visitNo}

*Medicines:*
${params.medicineList}

🌟 *Get well soon!* 🌟
Your health is our priority. Thank you for visiting us.`;
};
