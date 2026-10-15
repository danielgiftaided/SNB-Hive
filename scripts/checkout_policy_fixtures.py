def accept_checkout_policy(page):
    popup = page.get_by_role('dialog', name='Cancellation Policy', exact=True)
    popup.wait_for()
    popup.get_by_role('button', name='Continue to GoCardless', exact=True).click()
