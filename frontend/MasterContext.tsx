
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { MasterData } from './types';
import { getMasterData as fetchMasterData, saveMasterData as apiSaveMasterData } from './services/storage';

interface MasterContextType {
    masterData: MasterData | null;
    loading: boolean;
    refreshMasterData: () => Promise<void>;
    updateMasterData: (newData: MasterData) => Promise<void>;
}

const MasterContext = createContext<MasterContextType | undefined>(undefined);

export const MasterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [masterData, setMasterData] = useState<MasterData | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshMasterData = useCallback(async () => {
        try {
            const data = await fetchMasterData();
            setMasterData(data);
        } catch (error) {
            console.error("Failed to refresh master data:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    const updateMasterData = async (newData: MasterData) => {
        // Optimistic update
        setMasterData(newData);
        try {
            await apiSaveMasterData(newData);
        } catch (error) {
            console.error("Failed to save master data:", error);
            // Revert if API fails
            await refreshMasterData();
        }
    };

    useEffect(() => {
        refreshMasterData();

        // 1. Sync across tabs using BroadcastChannel
        const channel = new BroadcastChannel('master_data_sync');
        channel.onmessage = (event) => {
            if (event.data === 'REFRESH') {
                refreshMasterData();
            }
        };

        // 2. Periodic Polling (Fallback for real-time sync across devices)
        const pollInterval = setInterval(() => {
            refreshMasterData();
        }, 30000); // Every 30 seconds

        return () => {
            channel.close();
            clearInterval(pollInterval);
        };
    }, [refreshMasterData]);

    // Wrap apiSaveMasterData to notify other tabs
    const enhancedUpdateMasterData = async (newData: MasterData) => {
        // First update self and backend
        await updateMasterData(newData);

        // Notify other tabs on the same device
        const channel = new BroadcastChannel('master_data_sync');
        channel.postMessage('REFRESH');
        channel.close();
    };


    return (
        <MasterContext.Provider value={{
            masterData,
            loading,
            refreshMasterData,
            updateMasterData: enhancedUpdateMasterData
        }}>
            {children}
        </MasterContext.Provider>
    );
};

export const useMasterData = () => {
    const context = useContext(MasterContext);
    if (context === undefined) {
        throw new Error('useMasterData must be used within a MasterProvider');
    }
    return context;
};
