
import React from 'react';
import { WhatsappMessaging } from './WhatsappMessaging';
import { getStoredAuth } from '../services/storage';

const WhatsappPage: React.FC = () => {
    const user = getStoredAuth();
    if (!user) return null;

    return (
        <div className="space-y-6">
            {/* <h1 className="text-2xl font-heading font-bold text-white mb-6"></h1> */}
            <WhatsappMessaging user={user} />
        </div>
    );
};

export default WhatsappPage;
