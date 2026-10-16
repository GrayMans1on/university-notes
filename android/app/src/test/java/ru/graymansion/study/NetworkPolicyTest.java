package ru.graymansion.study;

import org.junit.Test;
import static org.junit.Assert.*;

public class NetworkPolicyTest {
    @Test
    public void modesRespectSelectedTransportAndRejectUnselectedConnections() {
        assertTrue(NetworkPolicy.allows("wifi", true, false));
        assertFalse(NetworkPolicy.allows("wifi", false, true));
        assertFalse(NetworkPolicy.allows("mobile", true, false));
        assertTrue(NetworkPolicy.allows("mobile", false, true));
        assertTrue(NetworkPolicy.allows("any", true, false));
        assertTrue(NetworkPolicy.allows("any", false, true));
        assertFalse(NetworkPolicy.allows("any", false, false));
        assertFalse(NetworkPolicy.allows("invalid", true, true));
    }
}
