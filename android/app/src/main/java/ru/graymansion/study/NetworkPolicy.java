package ru.graymansion.study;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;

final class NetworkPolicy {
    static String mode(Context context) {
        return context.getSharedPreferences("study", 0).getString("network-mode", "wifi");
    }

    static boolean allows(String mode, boolean wifi, boolean mobile) {
        return (mode.equals("wifi") || mode.equals("any")) && wifi
            || (mode.equals("mobile") || mode.equals("any")) && mobile;
    }

    static boolean permitted(Context context, Network network) {
        NetworkCapabilities caps = context.getSystemService(ConnectivityManager.class).getNetworkCapabilities(network);
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            && allows(mode(context), caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI),
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR));
    }

    static Network available(Context context) {
        ConnectivityManager manager = context.getSystemService(ConnectivityManager.class);
        Network active = manager.getActiveNetwork();
        if (active != null && permitted(context, active)) {
            return active;
        }
        for (Network network : manager.getAllNetworks()) {
            if (permitted(context, network)) {
                return network;
            }
        }
        return null;
    }

    static String label(Context context) {
        switch (mode(context)) {
            case "any": return "Wi-Fi или мобильный интернет";
            case "mobile": return "мобильный интернет";
            default: return "Wi-Fi";
        }
    }
}
