/*
 * This file is part of Imagey.
 *
 * Imagey is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Imagey is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Imagey.  If not, see <http://www.gnu.org/licenses/>.
 */
package cloud.imagey.junit;

import static com.icegreen.greenmail.configuration.GreenMailConfiguration.aConfig;
import static com.icegreen.greenmail.util.ServerSetup.PROTOCOL_SMTP;

import javax.enterprise.context.Dependent;
import javax.enterprise.inject.Produces;
import javax.enterprise.inject.Typed;

import org.junit.jupiter.api.extension.ExtensionContext;

import com.icegreen.greenmail.base.GreenMailOperations;
import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.store.FolderException;
import com.icegreen.greenmail.util.ServerSetup;

@Typed
@Dependent
public class ImageyGreenMailExtension extends GreenMailExtension {

    @Produces
    private static GreenMailOperations instance;

    public ImageyGreenMailExtension() {
        super(new ServerSetup(0, null, PROTOCOL_SMTP));
        withConfiguration(aConfig().withUser("user", "password"));
        withPerMethodLifecycle(false);
        instance = this;
    }

    @Override
    public void beforeAll(ExtensionContext context) {
        super.beforeAll(context);
        System.setProperty("smtp.port", Integer.toString(getSmtp().getPort()));
    }

    @Override
    public void afterEach(ExtensionContext context) {
        super.afterEach(context);
        try {
            purgeEmailFromAllMailboxes();
        } catch (FolderException e) {
            throw new IllegalStateException(e);
        }
    }

    @Override
    public void afterAll(ExtensionContext context) {
        super.afterAll(context);
        System.clearProperty("smtp.port");
    }
}
